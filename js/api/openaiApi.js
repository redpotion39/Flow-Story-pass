/**
 * OpenAI API Module
 * Handles communication with OpenAI API (Responses API for vision)
 */
const OpenaiApi = {
  MODEL: 'gpt-5-nano',
  API_URL: 'https://api.openai.com/v1/responses',

  /**
   * Generate prompt using OpenAI Responses API (vision)
   */
  async generatePrompt(apiKey, productImage, productName, hasPersonImage, ugcSettings) {
    // Resize image before sending
    const resizedImage = await ImageUtils.resizeImage(productImage);

    // Build request body using Responses API format
    // Note: GPT-5 models don't support temperature parameter
    const requestBody = {
      model: this.MODEL,
      max_completion_tokens: 16000,
      instructions: SystemPrompt.getSystemPrompt(),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: resizedImage,
              detail: 'low'
            },
            {
              type: 'input_text',
              text: SystemPrompt.buildUserMessage(productName, hasPersonImage, ugcSettings)
            }
          ]
        }
      ]
    };

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    console.log('OpenAI API Response:', data);

    // Extract text from output array
    const textOutput = data.output?.find(item => item.type === 'message');
    const content = textOutput?.content?.find(c => c.type === 'output_text');
    const text = content?.text || data.output_text;
    if (!text) {
      console.error('OpenAI empty response:', JSON.stringify(data).substring(0, 500));
      throw new Error('OpenAI ไม่ส่ง prompt กลับมา (อาจหมด token — ลองใหม่อีกครั้ง)');
    }
    return text;
  },

  /**
   * Generate video prompt using OpenAI Responses API (text only)
   */
  async generateVideoPrompt(apiKey, systemPrompt, userMessage) {
    const requestBody = {
      model: this.MODEL,
      max_completion_tokens: 16000,
      instructions: systemPrompt,
      input: userMessage
    };

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();

    // Extract text from output array
    const textOutput = data.output?.find(item => item.type === 'message');
    const content = textOutput?.content?.find(c => c.type === 'output_text');
    const text = content?.text || data.output_text;
    if (!text) {
      console.error('OpenAI empty response:', JSON.stringify(data).substring(0, 500));
      throw new Error('OpenAI ไม่ส่ง prompt กลับมา (อาจหมด token — ลองใหม่อีกครั้ง)');
    }
    return text;
  }
};
