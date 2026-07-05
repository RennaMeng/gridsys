const AI_PREVIEW_PROMPT = [
  '你是一个审美丰富的设计师，但这次任务不是重新设计版面，而是基于输入图片生成一个高完成度预览。',
  '输入图片是一张已经排好版的作品集页面。必须把它当作锁定的版式蓝图和内容来源。',
  '严格保持输入图片中所有文字、图片、图片顺序、图片裁切、图片比例、文字位置、图片区块位置、留白关系和整体网格结构。',
  '不要替换图片内容，不要生成新的主体图片，不要交换图片位置，不要把图片重新裁切到其他比例，不要移动标题、正文、图注或任何图片框。',
  '可以做的事情只包括：轻微提升整体视觉完成度、统一纸面质感、增强细微排版质感、改善边缘和背景的精致度、加入非常克制的院校作品集风格细节。',
  '风格以英国和欧洲设计院校的作品集页面为标准：干净、克制、专业、留白充足、图文关系清晰。',
  '最终结果必须看起来像输入图片的精修版本，而不是新的布局方案。'
].join('\n');

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
