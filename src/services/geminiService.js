// src/services/geminiService.js

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const fallbackDecision = {
  next_green_direction: "north",
  green_light_duration: 15,
  reasoning:
    "AI Error: Defaulting to a safe pattern due to an API or parsing issue.",
};

export async function getAITrafficDecision(state) {
  const { config, stats, trafficLights } = state;

  const prompt = `
    YOU ARE A JSON API. YOUR ONLY JOB IS TO RETURN A VALID JSON OBJECT.
    DO NOT OUTPUT ANY PROSE, EXPLANATIONS, OR MARKDOWN.

    Analyze the following traffic data:
    {
      "intersectionType": "${config.intersectionType}",
      "currentLights": {
        "north": "${trafficLights.north}",
        "south": "${trafficLights.south}",
        "east": "${trafficLights.east}",
        "west": "${trafficLights.west}"
      },
      "queueLengths": {
        "north": ${stats.queueLengths.north},
        "south": ${stats.queueLengths.south},
        "east": ${stats.queueLengths.east},
        "west": ${stats.queueLengths.west}
      },
      "longestWaitTimes": {
        "north": ${stats.longestWait.north.toFixed(1)},
        "south": ${stats.longestWait.south.toFixed(1)},
        "east": ${stats.longestWait.east.toFixed(1)},
        "west": ${stats.longestWait.west.toFixed(1)}
      }
    }

    Based on the data, decide which single approach (north, south, east, or west) should get the green light next and for how long to minimize congestion and wait times.

    Respond with ONLY a JSON object with the following exact keys: "next_green_direction", "green_light_duration", "reasoning".
    The "next_green_direction" must be one of: "north", "south", "east", "west".
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response || response.promptFeedback?.blockReason) {
      console.error(
        "Gemini API call was blocked. Reason:",
        response.promptFeedback?.blockReason,
      );
      return fallbackDecision;
    }

    const text = response.text();

    if (!text) {
      console.error("Gemini API returned an empty text response.");
      return fallbackDecision;
    }

    try {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        throw new Error("No valid JSON object found in the response text.");
      }
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      const parsedJson = JSON.parse(jsonString);

      let nextDirection =
        parsedJson.next_green_direction ||
        parsedJson.nextGreenDirection ||
        "north";

      const validDirections = ["north", "south", "east", "west"];
      if (!validDirections.includes(nextDirection.toLowerCase())) {
        nextDirection = "north";
      }

      const standardizedResponse = {
        next_green_direction: nextDirection.toLowerCase(),
        green_light_duration:
          parsedJson.green_light_duration || parsedJson.durationSeconds || 15,
        reasoning: parsedJson.reasoning || "Reasoning not provided by AI.",
      };

      console.log("Standardized AI Decision:", standardizedResponse);

      return standardizedResponse;
    } catch (error) {
      console.error("Failed to parse JSON from AI response. Error:", error);
      console.error("Problematic Raw Text:", text);
      return fallbackDecision;
    }
  } catch (error) {
    console.error("Fatal error during Gemini API call:", error);
    return fallbackDecision;
  }
}
