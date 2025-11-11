import { Request as ExpressRequest } from 'express';
import * as crypto from 'crypto';

type SesionActiva = {
  sessionId: string;
  creadoEn: number;
};

// 🧠 Sesiones en memoria (persisten solo en RAM durante la vida del backend)
const sesionesActivas = new Map<string, SesionActiva>();

export function getClientHash(req: ExpressRequest): string {
  const ip = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  const userAgent = req.headers['user-agent'] || '';
  const raw = `${ip}-${userAgent}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function obtenerSessionId(req: ExpressRequest): string {
  const hash = getClientHash(req);
  const ahora = Date.now();
  const sesion = sesionesActivas.get(hash);

  if (sesion && ahora - sesion.creadoEn < 3 * 24 * 60 * 60 * 1000) {
    return sesion.sessionId;
  }

  const nuevoId = crypto.randomUUID();
  sesionesActivas.set(hash, { sessionId: nuevoId, creadoEn: ahora });
  return nuevoId;
}
