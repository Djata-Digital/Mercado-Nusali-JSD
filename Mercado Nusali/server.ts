import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { apiRouter } from './src/server/api.js';
import { setupWebSocketServer } from './src/server/infra/websocket.js';
import { initializeQueues } from './src/server/infra/queues.js';
import { logger } from './src/server/infra/logger.js';

import { validateJwtConfigInProduction } from './src/server/modules/auth/jwtConfig.js';

dotenv.config();
validateJwtConfigInProduction();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize BullMQ background queues
  initializeQueues();

  // Setup WebSocket server with authenticated handshake
  setupWebSocketServer(server);

  // Security Middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite Dev / iframe compatibility
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Structured request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        logger.info(
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
          },
          'HTTP Request'
        );
      }
    });
    next();
  });

  // Mount Database & Infrastructure API Routes
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // Initialize Gemini AI Client
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY environment variable is missing.');
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Helper function to generate content with model fallback
  const generateGeminiWithFallback = async (ai: GoogleGenAI, contents: string, systemInstruction: string, temperature = 0.7) => {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature,
          },
        });
        if (response.text) return response.text;
      } catch (err: any) {
        console.warn(`Model ${model} failed, trying next fallback:`, err.message || err);
      }
    }
    return null;
  };

  // AI Shopper Assistant Endpoint
  app.post('/api/gemini/assistant', async (req, res) => {
    try {
      const { prompt, currentProducts } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.status(503).json({
          reply: 'Nusali Assistente: O serviço de inteligência artificial está temporariamente sem chave configurada. Mas posso tirar dúvidas básicas sobre entregas e produtos!',
        });
      }

      const productsContext = currentProducts && Array.isArray(currentProducts)
        ? currentProducts.map((p: { id: string; title: string; price: number; brand: string; rating: number; freeShipping: boolean; full: boolean }) =>
            `- ID: ${p.id} | ${p.title} | R$ ${p.price} | Marca: ${p.brand} | Nota: ${p.rating} | Frete Grátis: ${p.freeShipping ? 'Sim' : 'Não'} | Nusali Fulfillment: ${p.full ? 'Sim' : 'Não'}`
          ).join('\n')
        : '';

      const systemInstruction = `
Você é o "Nusali Assistente", o assistente oficial inteligente do Mercado Nusali.
Sua missão é ajudar os compradores a encontrar os melhores produtos no ecossistema CPLP (Guiné-Bissau, Brasil, Portugal, Angola, etc.), comparar preços, tirar dúvidas sobre entregas (Nusali Logística), pagamentos (Nusali Pay, Orange Money, PIX, cartão) e recomendar os produtos disponíveis na nossa loja.

Responda sempre em português de forma amigável, direta, prestativa e objetiva, usando emojis com moderação.
Se o usuário perguntar por recomendações, sugira os produtos do catálogo abaixo que melhor correspondem à necessidade dele, mencionando os nomes dos produtos e destaques.

Produtos disponíveis no catálogo atual:
${productsContext}
      `;

      const text = await generateGeminiWithFallback(ai, prompt, systemInstruction, 0.7);

      return res.json({
        reply: text || 'Olá! Sou o assistente do Mercado Nusali. Posso te ajudar a encontrar os melhores produtos, conferir prazos de entrega e entender nossas formas de pagamento!',
      });
    } catch (error: any) {
      console.error('Gemini Assistant Error:', error);
      return res.status(500).json({
        reply: 'Ocorreu um erro ao consultar o Nusali Assistente. Por favor, tente novamente em alguns instantes.',
      });
    }
  });

  // AI Seller Description Generator Endpoint
  app.post('/api/gemini/seller-description', async (req, res) => {
    try {
      const { title, category, brand, specs } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          description: `Produto ${title} de excelente qualidade da marca ${brand || 'Oficial'}. Garantia de fábrica e envio rápido pela Nusali Logística!`,
        });
      }

      const systemInstruction = `
Você é um especialista em vendas no Mercado Nusali.
Gere uma descrição profissional, atraente e persuasiva para o produto anunciado abaixo, formatada para alta conversão de vendas.
Inclua:
1. Um gancho principal destacando os benefícios.
2. Principais características e diferenciais.
3. Especificações técnicas resumidas.
4. Garantia e compromisso de entrega rápida.

Responda apenas com o texto da descrição do produto em Português.
      `;

      const contents = `Título: ${title}\nCategoria: ${category}\nMarca: ${brand}\nDetalhes: ${JSON.stringify(specs || {})}`;
      const text = await generateGeminiWithFallback(ai, contents, systemInstruction, 0.6);

      return res.json({
        description: text || `Produto ${title} de alta qualidade da marca ${brand || 'Oficial'}. Acompanha Nota Fiscal e garantia estendida com entrega rápida Nusali.`,
      });
    } catch (error: any) {
      console.error('Gemini Seller Description Error:', error);
      return res.json({
        description: `Anúncio oficial do produto ${req.body.title || ''}. Excelente custo-benefício com garantia e envio imediato.`,
      });
    }
  });

  // AI Seller Answer Endpoint for Product Q&A
  app.post('/api/gemini/seller-answer', async (req, res) => {
    try {
      const { productTitle, productSpecs, question } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          answer: 'Olá! Agradecemos o interesse. Sim, temos este produto a pronta entrega na caixa original com Nota Fiscal e Garantia!',
        });
      }

      const systemInstruction = `
Você é o Vendedor Oficial do produto "${productTitle}" no Mercado Nusali.
Responda à dúvida do comprador de maneira cordial, profissional, direta e prestativa em Português (1 a 2 frases curtas).
A dúvida é sobre o produto com as seguintes especificações: ${JSON.stringify(productSpecs || {})}.
Reforce a entrega rápida (Nusali Logística / Nusali Fulfillment) ou garantia de fábrica quando relevante.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Pergunta do cliente: "${question}"`,
        config: {
          systemInstruction,
          temperature: 0.5,
        },
      });

      return res.json({
        answer: response.text || 'Olá! Sim, o produto é original com nota fiscal e garantia do fabricante.',
      });
    } catch (error: any) {
      console.error('Gemini Seller Answer Error:', error);
      return res.json({
        answer: 'Olá! Agradecemos sua pergunta. Sim, produto novo com NF-e e envio imediato!',
      });
    }
  });

  // Vite Middleware in Development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mercado Nusali Server running on http://localhost:${PORT}`);
  });
}

startServer();
