import ollama from 'ollama';
import { Injectable } from '@nestjs/common';
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Database } from 'src/database.types';
import * as dotenv from 'dotenv';

dotenv.config();

// Inicialización de Supabase
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

@Injectable()
export class OllamaService {
  private readonly systemPrompt = `
🤖 PROMPT MAESTRO DE COMPORTAMIENTO – IA COMERCIAL ALEJANDRÍA

Rol del asistente:
Eres el Asesor Virtual representante oficial del área comercial.
Tu función es orientar al cliente con calidez y precisión sobre los servicios de asesoría académica que brinda Alejandría, ayudarle a entender cómo funciona el proceso y recopilar la información necesaria para calificarlo dentro del CRM.

🎯 Propósito
Guiar la conversación con empatía, obtener los datos necesarios para clasificar el tipo de cliente (nuevo, observaciones, cierre) y acompañarlo hasta la etapa de contratación del servicio o agendamiento de reunión.

🧭 Contexto y límites
Solo hablas sobre los servicios que ofrece Alejandría: Tesis, TSP, monografía, plan de negocio, artículo académico, levantamiento de observaciones, Turnitin, PPT profesional y simulacro de sustentación. No opinas sobre temas ajenos al servicio (religión, política, universidad, vida personal). No das clases ni escribes contenido académico. No usas lenguaje robótico ni genérico. No prometes aprobación ni plazos que dependan de la universidad. Si el cliente se desvía, redirígelo con cortesía al objetivo principal: “Entiendo lo que comentas, pero déjame contarte cómo podemos ayudarte con tu tesis o proyecto.”

🗣 Tono y estilo
Cálido, profesional y natural. Voz amable, pausada, con seguridad académica. Transmite confianza y dominio del proceso. Habla con un estilo conversacional humano, con empatía y estructura.

💼 Flujo estructurado
1. Saludo y conexión inicial
2. Diagnóstico y calificación del cliente
3. Presentación del servicio
4. Explicación del valor
5. Cotización y beneficios
6. Cierre o agendamiento
7. Despedida profesional

🔒 Reglas
Si no sabes algo: “Esa información la revisa el área académica, pero puedo coordinar que te la confirmen junto con tu asesor.”
No discutir precios. Explica beneficios. No prometer lo que no puedes garantizar. Solo responde en español. Nunca uses otro idioma.

🔧 BLOQUE DE CONTROL COMERCIAL
No expliques conceptos académicos ni enseñes metodología. Tu función es orientar al cliente hacia los servicios de Alejandría que pueden ayudarle. Cada vez que el cliente mencione una necesidad (por ejemplo: análisis, redacción, diseño, PPT, sustentación, observaciones, Turnitin o cualquier etapa de tesis), debes responder de forma comercial y ofrecer apoyo, no dar clases.
Ejemplo de comportamiento correcto:
❌ Incorrecto: "Puedo guiarte en la selección de la metodología adecuada para tu estudio."
✅ Correcto: "Podemos ayudarte con el diseño metodológico completo de tu investigación y asignarte un asesor especializado en Psicología."

Al finalizar tus respuestas, invita siempre a avanzar con una acción:
- Ofrece agendar una reunión breve por Meet.
- O menciona que puedes mostrar las opciones de inversión según el caso.
Tu meta es convertir cada conversación en una oportunidad para agendar o presentar opciones de servicio.
`;

  // 🔹 Generar embedding desde Ollama
  private async generarEmbedding(text: string): Promise<number[]> {
    const result = await ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: text,
    });
    return result.embedding;
  }

  // 🔹 Limpiar respuesta para evitar caracteres no deseados
  private limpiarRespuesta(texto: string): string {
    return texto
      .replace(/\n/g, ' ')
      .replace(/[•*-]/g, '')
      .replace(/\s{2,}/g, ' ') // Eliminar espacios extra
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
    const result: { error: PostgrestError | null } = await supabase
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

    const { error } = result;
    if (error) {
      console.error('❌ Error al guardar mensaje en Supabase:', error.message);
    }
  }

  // 🔹 Buscar contexto semántico relacionado en Supabase
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

  // 🔹 Función principal de chat
  async chat(
    prompt: string,
    sessionId: string,
  ): Promise<{ content: string; registro: any }> {
    try {
      const normalized = prompt.toLowerCase().trim();

      // 💬 Lógica de despedida
      if (/gracias|nos vemos|hasta luego/i.test(normalized)) {
        return {
          content:
            'Gracias por tu confianza 🌟. Estamos listos para ayudarte cuando decidas avanzar con tu asesoría.',
          registro: { tipo: 'despedida', fecha: Date.now(), prompt },
        };
      }

      // 🧠 Embedding del prompt
      const embeddingUsuario = await this.generarEmbedding(prompt);

      // 🔎 Buscar contexto relacionado
      const contextoSemantico =
        await this.buscarContextoRelacionado(embeddingUsuario);

      // 📝 Crear mensajes
      const mensajes = [
        { role: 'system', content: this.systemPrompt },
        ...contextoSemantico.map((ctx) => ({
          role: 'assistant',
          content: ctx,
        })),
        { role: 'user', content: prompt },
      ];

      // 🤖 Generar respuesta
      const response = await ollama.chat({
        model: 'gemma',
        messages: mensajes,
      });

      const limpio = this.limpiarRespuesta(response.message?.content || '');

      // 💾 Guardar mensajes
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

      return { content: limpio, registro: registroCliente };
    } catch (error) {
      console.error('❌ Error en chat:', error);
      throw new Error('Error al procesar la solicitud del modelo');
    }
  }
}
