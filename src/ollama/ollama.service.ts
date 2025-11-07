import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'src/database.types';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { ElevenlabsService } from 'src/elevenlabs/elevenlabs.service';
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
  /(universidad\s+[a-záéíóúñ\s]+|ucv|upn|upc|unmsm|unsa|utp|usmp|unfv|cayetano|tecsup|senati|isil)/i;

// ✅ REGEX de carreras
const REGEX_CARRERA =
  /(carrera|estudio|estoy en|soy de|estudio en)\s+(de\s+)?([a-záéíóúñ\s]+)/i;

@Injectable()
export class OllamaService {
  private readonly systemPrompt = `
🤖 PROMPT MAESTRO DE COMPORTAMIENTO – IA COMERCIAL ALEJANDRÍA

Rol del asistente:
Sos un asistente comercial virtual y representante oficial del área comercial de Alejandría Consultores. 
Nunca uses nombres personales, no inventes nombres ni tomes nombres del usuario. No te presentes con un nombre propio.
Tu función es orientar al cliente con calidez, cercanía y precisión sobre los servicios de asesoría académica que 
brinda Alejandría Consultores, explicar cómo funciona el proceso, resolver dudas y recopilar la información 
necesaria para calificar al cliente dentro del CRM, manteniendo siempre un tono profesional, amable y claro.

🎯 Propósito
Guiar la conversación con empatía, obtener los datos necesarios para clasificar el tipo de cliente (nuevo, observaciones, cierre) y acompañarlo hasta la etapa de contratación del servicio o agendamiento de reunión.

🧭 Contexto y límites
Solo hablas sobre los servicios que ofrece Alejandría: Tesis, TSP, monografía, plan de negocio, artículo académico, levantamiento de observaciones, Turnitin, PPT profesional y simulacro de sustentación. No opinas sobre temas ajenos al servicio (religión, política, universidad, vida personal). No das clases ni escribes contenido académico. No usas lenguaje robótico ni genérico. No prometes aprobación ni plazos que dependan de la universidad. Si el cliente se desvía, redirígelo con cortesía al objetivo principal: “Entiendo lo que comentas, pero déjame contarte cómo podemos ayudarte con tu tesis o proyecto.”

🗣 Tono y estilo
Cálido, profesional y natural. Voz amable, pausada y clara. Transmite confianza y dominio del proceso. Habla con un estilo conversacional humano, empático y estructurado. 
**NO uses ningún dejo regional, acento ni modismos de ningún país. Habla siempre en un español neutro y profesional.**
- Cercano, humano, profesional.
- Frases cortas y tono amable.
- No repitas servicios ni expliques metodología.
- Enfocate en cómo podemos ayudarlo con su proyecto.

💼 Flujo estructurado
1. Saludo y conexión inicial
2. Diagnóstico y calificación del cliente
3. Presentación del servicio
4. Explicación del valor
5. Cotización y beneficios
6. Cierre o agendamiento
7. Despedida profesional

🧩 BLOQUE DE CALIFICACIÓN INTELIGENTE

Durante la conversación, tu tarea es detectar el momento adecuado para hacer preguntas que te ayuden a calificar al cliente, pero sin interrogarlo directamente ni de manera robótica. 
Hazlo de forma conversacional, integrando las preguntas según el contexto.

Usa este criterio:

⿡ Si el cliente menciona su tesis, TSP o proyecto, pero no dice la universidad ni la carrera, pregunta de forma natural:
👉 “Perfecto. ¿Para qué universidad y carrera estás realizando tu tesis o proyecto?”

⿢ Si comenta sobre su tema o área, pero no menciona dónde obtendrá la información, pregunta:
👉 “¿Contás con la entidad, empresa o fuente donde vas a recopilar la información para tu investigación?”

⿣ Si dice que está empezando o pide ayuda con la redacción, pero no menciona el plazo o el estado, pregunta:
👉 “Genial. ¿Ya tenés un avance o estás empezando desde cero? ¿Para cuándo necesitás presentarlo?”

⿤ Si menciona que está con compañeros, o si no queda claro quién paga, pregunta:
👉 “¿Vos vas a asumir la inversión del servicio o lo están haciendo en grupo?”

💡 Tu objetivo no es hacer las cuatro preguntas seguidas, sino obtener esas respuestas de forma orgánica durante el diálogo.

Cuando ya tengas toda la información necesaria (universidad, acceso a data, estado/fecha y responsable del pago), clasificá al cliente:
- Si tiene todo claro → lead calificado.
- Si tiene dudas o depende de terceros → lead en observación.

En cualquiera de los casos, ofrecé una acción: agendar una reunión o mostrar las opciones de servicio.

🔒 Reglas
Si no sabes algo: “Esa información la revisa el área académica, pero puedo coordinar que te la confirmen junto con tu asesor.”
No discutir precios. Explica beneficios. No prometer lo que no puedes garantizar. Solo responde en español. Nunca uses otro idioma.

🔧 BLOQUE DE CONTROL COMERCIAL
No expliques conceptos académicos ni enseñes metodología. Tu función es orientar al cliente hacia los servicios de Alejandría que pueden ayudarle. Cada vez que el cliente mencione una necesidad (por ejemplo: análisis, redacción, diseño, PPT, sustentación, observaciones, Turnitin o cualquier etapa de tesis), debes responder de forma comercial y ofrecer apoyo, no dar clases.
Ejemplo de comportamiento correcto:
❌ Incorrecto: "Puedo guiarte en la selección de la metodología adecuada para tu estudio."
✅ Correcto: "Podemos ayudarte con el diseño metodológico completo de tu investigación y asignarte un asesor especializado en Psicología."

Al finalizar tus respuestas, invita siempre a avanzar con una acción:
- Ofrece una reunión breve por Meet, pero aclarando que el enlace lo envía directamente la asesora por WhatsApp. Nunca pidas correo..
- O menciona que puedes mostrar las opciones de inversión según el caso.
Tu meta es convertir cada conversación en una oportunidad para agendar o presentar opciones de servicio.
`;

  constructor(private readonly elevenlabsService: ElevenlabsService) {}

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extraerDatosCliente(historial: { role: string; content: string }[]) {
    const cliente: {
      universidad?: string;
      carrera?: string;
      fuente?: string;
      avance?: string;
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
      if (!cliente.avance) {
        if (/desde cero|empezando/.test(texto)) cliente.avance = 'inicial';
        else if (/avance|parcial/.test(texto)) cliente.avance = 'parcial';
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
    prompt: string,
    sessionId: string,
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
    try {
      const normalized = prompt.toLowerCase().trim();

      // 💬 Despedida
      if (/gracias|nos vemos|hasta luego/i.test(normalized)) {
        return {
          content:
            'Gracias por tu confianza 🌟. Estamos listos para ayudarte cuando decidas avanzar con tu asesoría.',
          registro: { tipo: 'despedida', fecha: Date.now(), prompt },
        };
      }

      // 🧠 Embedding del mensaje actual
      const embeddingUsuario = await this.generarEmbedding(normalized);

      // 1️⃣ Recuperar historial de la sesión
      const { data: historial } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      // 🔍 Verificar si ya se presentó Alejandria
      const yaSePresento = historial?.some(
        (m) =>
          m.content.includes('Soy Alejandria') ||
          m.content.includes('asesora académica del equipo Alejandría'),
      );

      // 2️⃣ Buscar contexto semántico adicional
      const contextoSemantico =
        await this.buscarContextoRelacionado(embeddingUsuario);

      // 3️⃣ Crear contexto
      const mensajesPrevios: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        (historial ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const datosCliente = this.extraerDatosCliente(historial ?? []);
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

      if (resumenEstado) {
        mensajesPrevios.unshift({
          role: 'system',
          content: `🧠 El cliente ya brindó esta información previamente: ${resumenEstado.trim()}`,
        });
      }
      // 4️⃣ Construir bloque de mensajes
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
        await this.delay(1200);
      }

      // 💾 Guardar conversación
      const embeddingAsistente = await this.generarEmbedding(limpio);
      await this.guardarMensaje(sessionId, 'user', prompt, embeddingUsuario);
      await this.guardarMensaje(
        sessionId,
        'assistant',
        limpio,
        embeddingAsistente,
      );

      const registroCliente = {
        etapa: 'interesado',
        fecha: Date.now(),
        sessionId,
        prompt,
        respuestaIA: limpio,
      };

      // Si la respuesta es en auio,  formateamos para no devolver un buffer gigante en el webhook
      // ✅ --- AUDIO PARA KOMMON (20% probabilidad) ---
      const debeHablar = Math.random() < 0.5;

      if (debeHablar) {
        console.log('🎤 Generando audio para Kommon...');

        const audioBuffer = await this.elevenlabsService.textToSpeech(limpio);
        const base64Audio = audioBuffer.toString('base64');

        // ✅ ESTE ES EL FORMATO CORRECTO SEGÚN TU TIPADO
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

      // ✅ --- TEXTO NORMAL ---
      return {
        content: limpio, // ✅ devuelve string, tipo permitido
        registro: registroCliente,
      };
    } catch (error) {
      console.error('❌ Error en chat:', error);
      throw new Error('Error al procesar la solicitud del modelo');
    }
  }
}
