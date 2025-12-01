import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'src/database.types';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { obtenerSessionId } from 'src/utils/session.util';
import { Request as ExpressRequest } from 'express';
import { ElevenlabsService } from 'src/elevenlabs/elevenlabs.service';
import { systemPrompt } from 'src/lib/systemPrompt';
import { KommoRequest } from './types/kommo.response';
dotenv.config();

// 🔑 Inicialización del cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔑 Inicialización de Supabase
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

const REGEX_UNI =
  /(universidad\s+[a-záéíóúñ\s]+|ucv|upn|upc|unmsm|unsa|utp|usmp|unfv|cayetano|tecsup|uni|usil)/i;

// ✅ REGEX de carreras
const REGEX_CARRERA =
  /(carrera|estudio|estoy en|soy de|estudio en)\s+(de\s+)?([a-záéíóúñ\s]+)/i;

const REGEX_APRENDER =
  /(quiero (aprender|saber)|solo (aprender|ver)|me puedes enseñar|enséñame|cómo hago (mi )?tesis|no (quiero|voy a) (comprar|contratar)|no busco servicio|curso|taller|capacitación|capacitaci[oó]n|plantilla(s)?|gu[ií]a|material|recursos)/i;

const REGEX_TRABAJO_PUNTUAL =
  /(arreglar|corregir|correcci[oó]n|formato|mejorar|editar|turnitin|plagio|powerpoint|ppt|diapositivas|observaciones|cap[ií]tulo|capitulo|solo una parte|solo necesito|corregir capítulo|revisión)/i;

const memoriaCliente = new Map<
  string,
  {
    universidad?: string;
    carrera?: string;
    fuente?: string;
    avance?: string;
    requiereDocumentoParaCotizar?: boolean;
    fechaEntrega?: string;
    formaPago?: string;
    yaEnvioDocumento?: boolean;
  }
>();

@Injectable()
export class OllamaService {
  constructor(private readonly elevenlabsService: ElevenlabsService) {}
  private systemPrompt: string = systemPrompt;

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extraerDatosCliente(historial: { role: string; content: string }[]) {
    const cliente: {
      universidad?: string;
      carrera?: string;
      fuente?: string;
      avance?: string;
      requiereDocumentoParaCotizar?: boolean;
      fechaEntrega?: string;
      formaPago?: string;
    } = {};

    for (const mensaje of historial) {
      if (mensaje.role !== 'user') continue;

      const texto = mensaje.content.toLowerCase();

      // ✅ UNIVERSIDAD robusta
      if (!cliente.universidad) {
        const matchU = texto.match(REGEX_UNI);
        if (matchU) cliente.universidad = matchU[0].trim();
      }

      // ✅ CARRERA robusta
      if (!cliente.carrera) {
        const matchC = texto.match(REGEX_CARRERA);
        if (matchC) cliente.carrera = matchC[3]?.trim();
      }

      // ✅ Fuente
      if (
        !cliente.fuente &&
        /(empresa|institución|organización|fuente|clínica|hospital)/.test(texto)
      ) {
        cliente.fuente = 'sí';
      }

      // ✅ Avance
      // ✅ DETECCIÓN DE AVANCE (VERSIÓN SEGURA)
      if (!cliente.avance) {
        // 🚀 Empezando desde cero
        if (
          /(desde cero|reci[eé]n empez|no tengo nada|sin avanzar|sin hacer|aún no empiezo|no he hecho nada|mi avance|tiene que estar|debe estar listo|fin de mes)/i.test(
            texto,
          )
        ) {
          cliente.avance = 'inicial';
        }

        // ✅ Avance parcial real (mejorado)
        else if (
          /(tengo un avance|ya tengo un avance|ya hice|ya tengo|llevo|he avanzado|voy por el cap[ií]tulo|cap[ií]tulo \d|capitulo \d|tengo parte|falta poco|solo falta|avance parcial)/i.test(
            texto,
          )
        ) {
          cliente.avance = 'parcial';
          cliente.requiereDocumentoParaCotizar = true;
        }

        // ✅ Confirmaciones simples después de pregunta del bot
        else if (!cliente.avance) {
          const ultimoMensajeBot =
            historial?.filter((m) => m.role === 'assistant').slice(-1)[0]
              ?.content || '';

          const botPreguntoAvance =
            /(avance|progreso|empezando|desde cero|ya tienes algo)/i.test(
              ultimoMensajeBot,
            );

          const confirmacion = /^(si|sí|claro|correcto|así es)$/i.test(
            texto.trim(),
          );

          if (botPreguntoAvance && confirmacion) {
            cliente.avance = 'parcial';
            cliente.requiereDocumentoParaCotizar = true;
          }
        }
      }

      // ✅ Fecha entrega
      if (!cliente.fechaEntrega) {
        const dateMatch = texto.match(/(\d{1,2}\/\d{1,2}|\d{4})/);
        if (dateMatch) cliente.fechaEntrega = dateMatch[1];
      }

      // ✅ Forma de pago
      if (!cliente.formaPago) {
        if (/grupo/.test(texto)) cliente.formaPago = 'grupo';
        else if (/pago|individual/.test(texto))
          cliente.formaPago = 'individual';
      }
    }

    return cliente;
  }

  // 🔹 Generar embedding usando OpenAI
  private async generarEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // 1536 dimensiones
      input: text,
    });
    return response.data[0].embedding;
  }

  // 🔹 Limpiar respuesta
  private limpiarRespuesta(texto: string): string {
    return texto
      .replace(/\n/g, ' ')
      .replace(/[•*-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // 🔹 Guardar mensaje en Supabase
  private async guardarMensaje(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    embedding: number[],
  ): Promise<void> {
    const id = uuidv4();
    const { error } = await supabase
      .from('chat_messages')
      .insert([
        {
          id,
          session_id: sessionId,
          role,
          content,
          embedding,
        },
      ])
      .select();

    if (error) {
      console.error('❌ Error al guardar mensaje en Supabase:', error.message);
    }
  }

  // 🔹 Buscar contexto semántico
  private async buscarContextoRelacionado(
    embedding: number[],
    topK = 3,
  ): Promise<string[]> {
    const { data, error } = await supabase.rpc('match_chat_messages', {
      query_embedding: embedding,
      match_count: topK,
    });

    if (error) {
      console.error('❌ Error al buscar contexto:', error.message ?? error);
      return [];
    }

    return data?.map((d) => d.content) ?? [];
  }

  // 🔹 Función principal del chat con control de presentación
  async chat(
    reqOrPrompt: KommoRequest | ExpressRequest | string,
    promptOrSessionId: string,
    fileRecibido?: { name: string; mimeType: string },
  ): Promise<{
    content:
      | string
      | Buffer
      | {
          isAudio: true;
          message: string;
          mimeType: string;
          base64: string;
        };
    registro: any;
  }> {
    let prompt: string;
    let sessionId: string;

    if (typeof reqOrPrompt === 'string') {
      // Forma antigua: (prompt, sessionId)
      prompt = reqOrPrompt;
      sessionId = promptOrSessionId;
    } else if ('sessionId' in reqOrPrompt) {
      // Llamado desde KOMMO
      prompt = promptOrSessionId;
      sessionId = reqOrPrompt.sessionId;
    } else {
      // Llamado desde controller HTTP normal
      const req = reqOrPrompt;
      prompt = promptOrSessionId;
      sessionId = obtenerSessionId(req);
    }

    try {
      const normalized = prompt.toLowerCase().trim();

      // Despedida
      if (/gracias|nos vemos|hasta luego/i.test(normalized)) {
        return {
          content:
            'Gracias por tu confianza 🌟. Estamos listos para ayudarte cuando decidas avanzar con tu asesoría.',
          registro: { tipo: 'despedida', fecha: Date.now(), prompt },
        };
      }
      // Derivación a Marketing: interés en aprender (sin contratar)
      const embeddingUsuario = await this.generarEmbedding(normalized);

      // Caso: el usuario quiere aprender (no contratar)
      if (REGEX_APRENDER.test(normalized)) {
        const mensajesEdu: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [
            {
              role: 'system',
              content: `
                    El usuario quiere aprender por su cuenta. 
                    No enseñes metodología, no des clases, no des recursos ni cursos.
                    No menciones áreas internas específicas (marketing, equipo, departamento).
                    Mantén tono humano, cálido y profesional.
                    Valida lo que dijo el usuario y coméntale brevemente que Alejandría también ofrece servicios formativos,
                    y que, si en algún momento desea profundizar, el área correspondiente puede darle más información.
                    No ofrezcas reunión ni cotización.
                    Responde en 2–3 oraciones máximo y termina con una pregunta abierta suave, relacionada con lo que comentó.
                  `,
            },
            { role: 'user', content: prompt },
          ];

        const completionEdu = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: mensajesEdu,
        });

        const respuestaEdu = this.limpiarRespuesta(
          completionEdu.choices[0]?.message?.content || '',
        );

        // Guardar respuesta en Supabase
        await this.guardarMensaje(
          sessionId,
          'assistant',
          respuestaEdu,
          await this.generarEmbedding(respuestaEdu),
        );

        return {
          content: respuestaEdu,
          registro: {
            tipo: 'lead_educativo',
            etapa: 'interes_en_aprender',
            fecha: Date.now(),
            sessionId,
            prompt,
            motivo: 'usuario_quiere_aprender',
          },
        };
      }

      if (REGEX_TRABAJO_PUNTUAL.test(normalized)) {
        const mensajesTrabajoPuntual = [
          {
            role: 'system',
            content: `
          El usuario solicita un trabajo puntual.
          Tu tarea:
          - Responde de forma natural y breve (2–3 oraciones).
          - Indica que para darle un monto justo necesitas revisar el archivo exacto.
          - Pide el archivo en tus propias palabras.
          - No pidas universidad, carrera, fecha ni forma de pago.
          - No ofrezcas reunión.
          - No uses frases fijas.
        `,
          },
          { role: 'user', content: prompt },
        ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: mensajesTrabajoPuntual,
        });

        const respuesta = this.limpiarRespuesta(
          completion.choices[0]?.message?.content || '',
        );

        return {
          content: respuesta,
          registro: {
            tipo: 'trabajo_puntual',
            etapa: 'solicitar_archivo_para_cotizacion',
            fecha: Date.now(),
            sessionId,
            prompt,
          },
        };
      }

      // Recuperar historial de la sesión
      const { data: historial } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      // Verificar si ya se presentó Alejandria
      const yaSePresento = historial?.some(
        (m) =>
          m.content.includes('Soy Alejandria') ||
          m.content.includes('asesora académica del equipo Alejandría'),
      );

      // Buscar contexto semántico adicional
      const contextoSemantico =
        await this.buscarContextoRelacionado(embeddingUsuario);

      // Crear contexto
      const mensajesPrevios: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        (historial ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        }));

      let datosCliente = memoriaCliente.get(sessionId);

      if (!datosCliente) {
        datosCliente = this.extraerDatosCliente(historial ?? []);
        memoriaCliente.set(sessionId, datosCliente);
      }

      let resumenEstado = '';
      const isCalificado =
        datosCliente.universidad &&
        datosCliente.carrera &&
        datosCliente.avance &&
        datosCliente.fechaEntrega &&
        datosCliente.formaPago;

      if (datosCliente.universidad)
        resumenEstado += `Ya indicó que la universidad es ${datosCliente.universidad}. `;
      if (datosCliente.carrera)
        resumenEstado += `La carrera es ${datosCliente.carrera}. `;
      if (datosCliente.fuente)
        resumenEstado += `Mencionó que ya tiene una fuente para su investigación. `;
      if (datosCliente.avance)
        resumenEstado += `Dijo que está ${datosCliente.avance === 'inicial' ? 'empezando desde cero' : 'con un avance parcial'}. `;
      if (datosCliente.fechaEntrega)
        resumenEstado += `La fecha aproximada de entrega es ${datosCliente.fechaEntrega}. `;
      if (datosCliente.formaPago)
        resumenEstado += `Indicó que el pago será ${datosCliente.formaPago}. `;
      if (/precio|costo|cuánto/i.test(normalized) && !isCalificado) {
        return {
          content:
            'Claro, puedo orientarte con la inversión, pero primero necesito entender un poquito tu proyecto para darte una opción adecuada. ¿Para qué universidad y carrera es tu tesis o trabajo?',
          registro: {
            tipo: 'prospectar-antes-de-precio',
            fecha: Date.now(),
            prompt,
          },
        };
      }

      const yaEnvioDocumento = datosCliente.yaEnvioDocumento;

      // Solicitar documento APENAS detecta avance parcial
      if (
        datosCliente.avance === 'parcial' &&
        !fileRecibido &&
        !yaEnvioDocumento
      ) {
        return {
          content:
            'Perfecto, como ya tienes un avance, necesitamos revisar el documento para poder enviarte una cotización justa. ¿Podrías compartirlo por aquí para que el área de cotización lo evalúe?',
          registro: {
            tipo: 'solicitud-documento-inmediata',
            etapa: 'esperando_documento',
            fecha: Date.now(),
            prompt,
          },
        };
      }

      // Solicitar documento SI YA ESTÁ CALIFICADO y aún no lo envió
      if (
        isCalificado &&
        datosCliente.requiereDocumentoParaCotizar &&
        !fileRecibido &&
        !yaEnvioDocumento
      ) {
        return {
          content:
            'Como ya cuentas con un avance, necesitamos revisar tu documento para poder darte una cotización precisa. ¿Podrías enviarlo para que el área de cotización lo evalúe?',
          registro: {
            tipo: 'solicitud-documento-cotizacion',
            etapa: 'esperando_documento',
            fecha: Date.now(),
            prompt,
          },
        };
      }

      // Actualizar memoria: marcamos que ya envió archivo
      datosCliente.yaEnvioDocumento = true;
      memoriaCliente.set(sessionId, datosCliente);

      // Si se envió un documento
      if (fileRecibido) {
        if (!isCalificado) {
          return {
            content:
              'Perfecto, gracias por el archivo 📄. Antes de que el área de cotización pueda revisarlo, necesito unos datos básicos: ¿Para qué universidad y carrera es tu proyecto? También necesito saber si ya tienes una fecha aproximada de entrega y si el pago lo harás de manera individual o en grupo.',
            registro: {
              tipo: 'documento_recibido_sin_calificar',
              fecha: Date.now(),
              prompt,
              archivo: fileRecibido,
            },
          };
        }

        return {
          content: `Perfecto, recibí tu archivo *${fileRecibido.name}* 📄. El área de cotización lo revisará y te responderá con todos los detalles en breve.`,
          registro: {
            tipo: 'documento_recibido_calificado',
            etapa: 'esperando_cotizacion',
            fecha: Date.now(),
            prompt,
            archivo: fileRecibido,
          },
        };
      }

      if (resumenEstado) {
        mensajesPrevios.unshift({
          role: 'system',
          content: `🧠 El cliente ya brindó esta información previamente: ${resumenEstado.trim()}`,
        });
      }

      // Construir bloque de mensajes
      const mensajes: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: this.systemPrompt },
        ...mensajesPrevios,
        ...contextoSemantico.map((ctx) => ({
          role: 'assistant' as const,
          content: ctx,
        })),
        { role: 'user', content: prompt },
      ];

      // Si no se ha presentado aún, antepone el mensaje inicial
      if (!yaSePresento) {
        mensajes.splice(1, 0, {
          role: 'assistant',
          content:
            '¡Hola! Soy Alejandria, asesora académica del equipo Alejandría 👩‍💻. Para brindarte una información más personalizada, ¿podrías contarme de qué carrera, grado académico y para qué universidad sería el servicio?',
        });
      }

      // 🤖 Generar respuesta
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: mensajes,
      });

      const limpio = this.limpiarRespuesta(
        completion.choices[0]?.message?.content || '',
      );

      if (limpio.length > 180) {
        await this.delay(3200);
      }

      // Guardar conversación
      const embeddingAsistente = await this.generarEmbedding(limpio);
      await this.guardarMensaje(sessionId, 'user', prompt, embeddingUsuario);
      await this.guardarMensaje(
        sessionId,
        'assistant',
        limpio,
        embeddingAsistente,
      );
      const aceptaReunion =
        /^sí(\b|,)/i.test(normalized) || // si la frase comienza con "sí"
        /(?:^|\s)(si|sí)\s+(claro|perfecto|mañana|podría|podria|me parece|est[aá] bien|de acuerdo|coordinemos|agendemos|podemos|dale)/i.test(
          normalized,
        ) ||
        /(claro|perfecto|ok|vale|dale|listo|suena bien|me parece bien|est[aá] bien|de acuerdo|mañana|podría ser|podria ser|hagámoslo|hagamoslo|coordinemos|agendemos)/i.test(
          normalized,
        );

      // -----------------------------------------------------------
      const botInvitoReunion =
        /(agend(a|emos|ar|áramos)|coordinar|coordinemos|program(ar|emos)|organizar|reservar)\s+(una\s+)?reuni[oó]n/i.test(
          limpio,
        ) ||
        /(reuni[oó]n\s+breve|reuni[oó]n\s+por\s+meet|meet|zoom|google\s+meet)/i.test(
          limpio,
        ) ||
        /(te\s+enviar[áa]\s+el\s+enlace|te\s+pas[oó]\s+el\s+enlace|te\s+mand[oó]\s+el\s+link)/i.test(
          limpio,
        ) ||
        /(quieres|gustar[ií]a|podemos|deber[ií]amos)\s+(que\s+)?(agendar|coordinar|programar)\s+(una\s+)?reuni[oó]n/i.test(
          limpio,
        );

      const datosCompletos =
        datosCliente.universidad && datosCliente.carrera && datosCliente.avance;
      // Tipo del lead inicial
      let tipoLead: 'FRIO' | 'TIBIO' = 'FRIO';

      if (fileRecibido && isCalificado) {
        tipoLead = 'TIBIO';
      } else if (aceptaReunion) {
        tipoLead = 'TIBIO';
      } else if (botInvitoReunion) {
        tipoLead = 'TIBIO';
      } else if (datosCompletos) {
        tipoLead = 'TIBIO';
      }

      const registroCliente = {
        tipo: tipoLead,
        etapa: 'interesado',
        fecha: Date.now(),
        sessionId,
        prompt,
        respuestaIA: limpio,
      };

      // AUDIO PARA KOMMON (20% probabilidad)
      const debeHablar = Math.random() < 0.2;

      if (debeHablar) {
        console.log('🎤 Generando audio para Kommon...');

        const audioBuffer = await this.elevenlabsService.textToSpeech(limpio);
        const base64Audio = audioBuffer.toString('base64');

        return {
          content: {
            isAudio: true,
            message: 'Audio generado',
            mimeType: 'audio/mpeg',
            base64: base64Audio,
          },
          registro: registroCliente,
        };
      }

      // --- TEXTO NORMAL ---
      return {
        content: limpio,
        registro: registroCliente,
      };
    } catch (error) {
      console.error('❌ Error en chat:', error);
      throw new Error('Error al procesar la solicitud del modelo');
    }
  }
}
