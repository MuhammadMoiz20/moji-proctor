/**
 * Vercel Serverless Handler
 * Wraps the Fastify server for Vercel's serverless environment
 */

import type { FastifyInstance } from 'fastify';

interface ServerlessRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ServerlessResponse {
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  status(code: number): ServerlessResponse;
  send(body: unknown): void;
  json(body: unknown): void;
}

let serverInstance: FastifyInstance | null = null;
let initError: Error | null = null;

async function initialize(): Promise<FastifyInstance> {
  if (initError) {
    throw initError;
  }
  if (!serverInstance) {
    try {
      const { createServer } = await import('../src/index.js');
      serverInstance = await createServer();
      await serverInstance!.ready();
    } catch (err) {
      initError = err instanceof Error ? err : new Error(String(err));
      throw initError;
    }
  }
  return serverInstance!;
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  try {
    const server = await initialize();
    
    // Build the full URL for Fastify inject
    const url = req.url || '/';
    
    // Convert headers to simple object format
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }
    
    // Use Fastify's inject method which properly routes through the framework
    const response = await server.inject({
      method: (req.method || 'GET') as any,
      url,
      headers,
      payload: req.body as any,
    } as any) as {
      statusCode: number;
      headers: Record<string, string | string[] | undefined>;
      payload: string;
    };
    
    // Copy response headers
    const responseHeaders = response.headers;
    for (const [key, value] of Object.entries(responseHeaders)) {
      if (value !== undefined) {
        res.setHeader(key, value as string);
      }
    }
    
    // Send the response
    res.status(response.statusCode).send(response.payload);
  } catch (error) {
    // If response hasn't been sent yet, send error
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
      });
    }
  }
}
