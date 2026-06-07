// Simple OpenAI to NVIDIA NIM API Proxy
// Deploy this to any Node.js hosting service (Railway, Render, Vercel, etc.)

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// NVIDIA NIM API configuration
const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY; // Set this in your hosting platform

// 🔥 REASONING DISPLAY TOGGLE - Shows/hides reasoning in output
const SHOW_REASONING = false; // Set to true to show reasoning with <think> tags

// 🔥 THINKING MODE TOGGLE - Enables thinking for specific models that support it
const ENABLE_THINKING_MODE = false; // Set to true to enable chat_template_kwargs thinking parameter

// Model mapping (maps OpenAI model names to NVIDIA models)
const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'google/gemma-4-31b-it',
  'gpt-4': 'qwen/qwen3-next-80b-a3b-instruct',
  'gpt-4-turbo': 'qwen/qwen3.5-122b-a10b',
  'gpt-4o': 'mistralai/mistral-small-4-119b-2603',
  'claude-3-opus': 'mistralai/mistral-medium-3.5-128b',
  'claude-3-sonnet': 'mistralai/ministral-14b-instruct-2512'
  };

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'OpenAI to NVIDIA NIM Proxy',
    nim_api_configured: !!NIM_API_KEY
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'OpenAI to NVIDIA NIM Proxy is running',
    endpoints: {
      health: '/health',
      models: '/v1/models',
      chat: '/v1/chat/completions'
    }
  });
});

// List available models (OpenAI compatible)
app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'nvidia-nim'
  }));
  
  res.json({
    object: 'list',
    data: models
  });
});

// Main chat completions endpoint (OpenAI compatible)
app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      return res.status(500).json({
        error: {
          message: 'NIM_API_KEY not configured',
          type: 'configuration_error'
        }
      });
    }

    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    // Map OpenAI model to NVIDIA model
    const nimModel = MODEL_MAPPING[model] || 'meta/llama-3.1-8b-instruct';
    
    // Prepare request for NVIDIA NIM API
    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 1024,
      stream: stream || false
    };
    
    // Make request to NVIDIA NIM
    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      nimRequest,
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: stream ? 'stream' : 'json'
      }
    );
    
    if (stream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      response.data.pipe(res);
    } else {
      // Return standard JSON response
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices,
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.response?.data || error.message);
    
    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.detail || error.message,
        type: 'api_error'
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OpenAI to NVIDIA NIM Proxy running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 NIM API Key configured: ${!!NIM_API_KEY}`);
});

module.exports = app;
