<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Grid.sys Portfolio Layout Tool

This project is a web-based AI layout generation tool for design portfolio pages.
It uses JSON layout templates as design rules, then calls a Vercel serverless API to generate dynamic Render JSON from user prompts and uploaded materials.

View your app in AI Studio: https://ai.studio/apps/e708826b-7768-4cf7-bf5e-78a99a9a6179

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Create a local `.env` file if you want to test the API locally:
   `GEMINI_API_KEY="your-gemini-api-key-here"`
3. Run the app:
   `npm run dev`

## Deploy on Vercel

Add this environment variable in Vercel Project Settings:

`GEMINI_API_KEY`

Do not commit a real API key to GitHub. The frontend calls `/api/generate-layout`, and the serverless API reads `GEMINI_API_KEY` securely on the server.

## Template System

Templates live in `public/templates/` and define layout rules, content slots, visual hierarchy, and AI generation logic. They are references for AI generation, not fixed layouts.

Current templates:

- `discover_context_mapping_16x9`
- `develop_prototype_demo_16x9`
