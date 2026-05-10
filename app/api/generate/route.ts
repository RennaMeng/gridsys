import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const systemPrompt = `你是一个专业的 Swiss Design 排版系统。
你的任务是根据用户的描述和 Moodboard 参考图，生成一个适合的网格排版布局。

网格系统规格：
- 画布：12列 × 8行
- 每列宽：60px，每行高：45px，间距：12px
- 坐标从 (0,0) 开始，x 最大 11，y 最大 7

你必须只输出一个合法的 JSON 对象，不要有任何其他文字、解释或 markdown 代码块。
格式如下：
{
  "blocks": [
    { "type": "title", "label": "标题文字", "x": 0, "y": 0, "w": 8, "h": 1, "category": "Generic" },
    { "type": "image", "label": "IMAGE", "x": 0, "y": 1, "w": 6, "h": 5, "category": "Generic" },
    { "type": "text", "label": "描述文字", "x": 6, "y": 1, "w": 6, "h": 3, "category": "Generic" }
  ],
  "reasoning": "简短说明排版思路（中文）"
}

type 只能是: container | text | heading | image | title
category 只能是: Generic | Define | Ideation | Prototype | Final
确保所有 block 不超出边界：x + w <= 12，y + h <= 8`;

export async function POST(req: NextRequest) {
  try {
    const { message, images } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const modelName = images?.length > 0
      ? 'gemini-2.5-pro-preview-05-06'
      : 'gemini-2.0-flash';

    const imageParts = (images || []).map((base64: string) => ({
      inlineData: {
        mimeType: 'image/jpeg' as const,
        data: base64.split(',')[1],
      },
    }));

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        ...imageParts,
        { text: message },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Gemini API error:', err);
    return NextResponse.json(
      { error: err.message || 'Generation failed' },
      { status: 500 }
    );
  }
}