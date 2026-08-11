// Direct browser call to the Claude API to turn a freeform food description into
// structured nutrition estimates. Uses a forced tool call so the response is
// reliable JSON instead of free text that needs parsing.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const NUTRITION_TOOL = {
  name: 'record_nutrition',
  description: 'Record estimated nutrition facts for the described food or meal.',
  input_schema: {
    type: 'object',
    properties: {
      food_name: { type: 'string', description: 'Short clean name for the food/meal, e.g. "2 fried eggs and buttered toast"' },
      calories: { type: 'number', description: 'Estimated total calories' },
      protein_g: { type: 'number', description: 'Estimated protein in grams' },
      carbs_g: { type: 'number', description: 'Estimated carbohydrates in grams' },
      fat_g: { type: 'number', description: 'Estimated fat in grams' },
      confidence_note: { type: 'string', description: 'One short sentence noting any assumptions made about quantity/preparation' },
    },
    required: ['food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
  },
};

const SYSTEM_PROMPT =
  'You are a nutrition estimation assistant inside a personal food log. Given a short, casual ' +
  'description of food or drink someone consumed, estimate total calories and macros using typical ' +
  'serving sizes and preparation methods when the description does not specify them. Be reasonable ' +
  'and decisive rather than asking questions. Always respond by calling record_nutrition.';

export class NutritionApiError extends Error {}

export async function parseFoodDescription(description, settings) {
  if (!settings.apiKey) {
    throw new NutritionApiError('No Anthropic API key set. Add one in Settings.');
  }

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
        tools: [NUTRITION_TOOL],
        tool_choice: { type: 'tool', name: 'record_nutrition' },
      }),
    });
  } catch (err) {
    throw new NutritionApiError('Network error reaching the Claude API. Check your connection.');
  }

  if (!response.ok) {
    let message = `Claude API error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore parse failure, use default message
    }
    throw new NutritionApiError(message);
  }

  const data = await response.json();
  const toolBlock = (data.content || []).find((b) => b.type === 'tool_use');
  if (!toolBlock) {
    throw new NutritionApiError('Claude did not return structured nutrition data.');
  }

  const input = toolBlock.input || {};
  return {
    food_name: String(input.food_name || description).slice(0, 200),
    calories: Number(input.calories) || 0,
    protein_g: Number(input.protein_g) || 0,
    carbs_g: Number(input.carbs_g) || 0,
    fat_g: Number(input.fat_g) || 0,
    confidence_note: input.confidence_note ? String(input.confidence_note) : '',
  };
}
