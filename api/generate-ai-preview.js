const AI_PREVIEW_PROMPT = '你是一个审美丰富的设计师，根据这个预排版的图片，生成一张完整的设计作品集页面，风格以英国和欧洲的设计院校风格为标准，可以适当的加一些可视化内容，但是不要更改版面中自带的图片和文字的位置和内容';

const extractImageUrl = (payload) => {
  const candidates = [
    payload?.imageUrl,
    payload?.url,
    payload?.data?.[0]?.url,
    payload?.data?.[0]?.b64_json ? `data:image/png;base64,${payload.data[0].b64_json}` : undefined,
    payload?.images?.[0]?.url,
    payload?.images?.[0]?.image_url?.url,
    payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url,
    payload?.choices?.[0]?.message?.images?.[0]?.url
  ];

  return candidates.find(value => typeof value === 'string' && value.length > 0);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.openrouterimageeneration || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'openrouterimageeneration is not configured.' });
  }

  const { boardImage, canvas } = req.body || {};
  if (!boardImage || typeof boardImage !== 'string' || !boardImage.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A data URL board image is required.' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.origin || 'https://grid-sys.vercel.app',
        'X-Title': 'Grid.sys AI Preview'
      },
      body: JSON.stringify({
        model: 'openai/gpt-image-2',
        prompt: AI_PREVIEW_PROMPT,
        input_references: [
          {
            type: 'image_url',
            image_url: {
              url: boardImage
            }
          }
        ],
        size: '1536x1024',
        quality: 'high',
        response_format: 'b64_json',
        metadata: {
          canvasLabel: canvas?.label,
          canvasWidth: canvas?.width,
          canvasHeight: canvas?.height
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error?.message || payload?.message || 'OpenRouter image generation failed.',
        details: payload
      });
    }

    const imageUrl = extractImageUrl(payload);
    if (!imageUrl) {
      return res.status(502).json({
        error: 'OpenRouter did not return an image URL.',
        details: payload
      });
    }

    return res.status(200).json({ imageUrl });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'AI preview generation failed.'
    });
  }
}
