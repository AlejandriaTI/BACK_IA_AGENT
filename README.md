# 🤖 Agente IA - Alexandria AI

Este proyecto es un **Agente de Inteligencia Artificial** desarrollado con **NestJS** que automatiza la interacción con clientes a través de **Kommo CRM**. Utiliza modelos de lenguaje avanzados (OpenAI GPT-4o) y síntesis de voz (ElevenLabs) para ofrecer una experiencia de asesoría académica personalizada.

## 🚀 Características Principales

- **Integración con Kommo CRM**:
  - Gestión automática de leads y pipelines (Frío, Tibio, Cotización, Marketing).
  - Sincronización de mensajes de texto y audio.
  - Etiquetado automático de leads (ej. `STOP` si el lead no es viable).
- **Inteligencia Artificial Conversacional**:
  - Motor basado en **OpenAI (GPT-4o)** para entender y responder consultas.
  - Detección de intención (ej. solicitud de cotización, interés educativo, trabajo puntual).
  - Memoria contextual utilizando **Supabase** y embeddings vectoriales.
- **Capacidades de Voz (ElevenLabs)**:
  - **Text-to-Speech (TTS)**: Generación de respuestas de audio naturales.
  - **Speech-to-Text (STT)**: Transcripción de mensajes de audio recibidos.
- **Procesamiento en Segundo Plano**:
  - Uso de **BullMQ** y **Redis** para manejar colas de procesamiento de IA y tareas pesadas.

## 🛠️ Stack Tecnológico

- **Framework**: [NestJS](https://nestjs.com/)
- **Lenguaje**: TypeScript
- **IA / LLM**: OpenAI API (GPT-4o)
- **Voz**: ElevenLabs API
- **Base de Datos**: Supabase (PostgreSQL + pgvector)
- **Colas**: BullMQ + Redis
- **CRM**: Kommo (anteriormente AmoCRM)

## 📋 Prerrequisitos

Antes de ejecutar el proyecto, asegúrate de tener instalado:

- [Node.js](https://nodejs.org/) (v18 o superior)
- [Redis](https://redis.io/) (necesario para las colas de BullMQ)
- Una cuenta y proyecto en [Supabase](https://supabase.com/)
- Claves de API para OpenAI, ElevenLabs y Kommo.

## ⚙️ Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# 🧠 OpenAI
OPENAI_API_KEY=sk-...

# 🗄️ Supabase (Base de datos y Embeddings)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key

# 🤝 Kommo CRM
KOMMO_SUBDOMAIN=tu-subdominio
KOMMO_KEY_DURATION=tu-token-de-larga-duracion

# 🗣️ ElevenLabs (Voz)
ELEVENLABS_API_KEY_TTS=tu-api-key-tts
ELEVENLABS_API_KEY_STT=tu-api-key-stt
ELEVENLABS_API_URL=https://api.elevenlabs.io/v1
ELEVENLABS_VOICE_ID=oYBnOnwnfG6w5YK4xE3C

# ⚡ Redis (Colas)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 📦 Instalación

```bash
$ npm install
```

## ▶️ Ejecución

```bash
# Modo desarrollo
$ npm run start:dev

# Modo producción
$ npm run start:prod
```

## 📂 Estructura del Proyecto

- `src/kommo`: Servicios y controladores para la integración con la API de Kommo. Maneja webhooks y sincronización de leads.
- `src/ollama`: (Nombre legado) Contiene la lógica principal de IA, integración con OpenAI, gestión de prompts y memoria con Supabase.
- `src/elevenlabs`: Servicios para la conversión de texto a voz y viceversa.
- `src/config`: Configuraciones globales (ej. BullMQ).
- `src/lib`: Utilidades y prompts del sistema.

## 🧪 Tests

```bash
# Unit tests
$ npm run test

# E2E tests
$ npm run test:e2e
```

## 📄 Licencia

Este proyecto es privado y propietario.
