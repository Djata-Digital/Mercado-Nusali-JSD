/**
 * Rotas públicas de SEO e entrega do SPA (C3.2), usadas por server.ts:
 *   - GET /robots.txt   (text/plain real; antes caía no fallback SPA e devolvia HTML)
 *   - GET /sitemap.xml  (XML dinâmico, só URLs públicas)
 *   - /api/*            desconhecido => JSON 404 (antes: index.html com 200)
 *   - handler SPA       lê dist/index.html, injeta os metadados da rota e responde com o status certo (404 real para
 *                       produto/categoria/loja inexistente ou não público e para rota desconhecida)
 */
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction, Express } from 'express';
import { getSeoConfig } from './seoConfig.js';
import { buildRobotsTxt, buildSitemapXml, buildSeoPage, injectSeoHead } from './seoService.js';
import { classifyRequestPath } from './hostPolicy.js';
import { logger } from '../../infra/logger.js';

const STATIC_FILE_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|js|mjs|css|map|json|txt|xml|webmanifest|woff2?|ttf|otf|eot|pdf|mp4|webm)$/i;

export function apiNotFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
}

export function robotsHandler(_req: Request, res: Response) {
  res.status(200).type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(buildRobotsTxt(getSeoConfig()));
}

export async function sitemapHandler(_req: Request, res: Response) {
  try {
    const xml = await buildSitemapXml(getSeoConfig());
    res.status(200).type('application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=300').send(xml);
  } catch (err: any) {
    logger.error({ err: err?.message }, 'SITEMAP_BUILD_FAILED');
    res.status(503).type('text/plain; charset=utf-8').send('Sitemap temporariamente indisponível.');
  }
}

/** Registra robots, sitemap e o 404 JSON da API. Deve ser chamado DEPOIS de montar as rotas /api reais. */
export function registerSeoRoutes(app: Express) {
  app.get('/robots.txt', robotsHandler);
  app.get('/sitemap.xml', sitemapHandler);
  app.use('/api', apiNotFoundHandler);
}

export function createSpaHandler(distPath: string) {
  const indexPath = path.join(distPath, 'index.html');
  let template: string | null = null;
  const loadTemplate = () => {
    if (template === null) template = fs.readFileSync(indexPath, 'utf8');
    return template;
  };

  return async function spaHandler(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const kind = classifyRequestPath(req.path);
    if (kind === 'api') return apiNotFoundHandler(req, res);
    // /assets/* e arquivos estáticos que não existem: 404 de verdade (antes devolviam index.html 200 — chunk antigo virava HTML).
    if (kind === 'asset' || STATIC_FILE_RE.test(req.path)) return res.status(404).type('text/plain; charset=utf-8').send('Not found');
    if (req.path === '/index.html') return res.redirect(301, '/');

    try {
      const cfg = getSeoConfig();
      const page = await buildSeoPage(req.path, cfg);
      const html = injectSeoHead(loadTemplate(), page);
      res.status(page.status).set('Content-Type', 'text/html; charset=UTF-8').set('Cache-Control', 'public, max-age=0, must-revalidate');
      if (/noindex/.test(page.robots)) res.set('X-Robots-Tag', 'noindex, nofollow');
      return res.send(html);
    } catch (err: any) {
      logger.error({ err: err?.message, path: req.path }, 'SPA_HTML_RENDER_FAILED');
      return res.sendFile(indexPath);
    }
  };
}
