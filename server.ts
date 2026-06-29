import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up json parser with standard limit for base64 images
app.use(express.json({ limit: "15mb" }));

// Helper to safely get Gemini client with lazy loading
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// REST API for house redesign
app.post("/api/redesign", async (req, res) => {
  try {
    const { image, mimeType, controls } = req.body;

    if (!controls) {
      return res.status(400).json({ error: "Missing redesign controls configuration." });
    }

    // Build the prompt from controls
    const featuresList: string[] = [];
    if (controls.balcony) featuresList.push("a premium cantilevered glass-railing balcony");
    if (controls.garage) featuresList.push("a modern seamless glass-door garage integrated with the main volume");
    if (controls.garden) featuresList.push("a minimalist Japanese-inspired landscaped zen garden with elegant pathway lighting");
    if (controls.swimmingPool) featuresList.push("a luxury outdoor infinity swimming pool with sparkling turquoise water");
    if (controls.solarPanels) featuresList.push("ultra-thin sleek integrated black solar roof panels");
    if (controls.smartHomeFeatures) featuresList.push("dynamic ambient smart architectural lighting integrated into the wood paneling");

    const promptText = `
An ultra-realistic, high-quality professional architectural photograph of a modern luxury home.
Style specs:
- Modernist Architecture Redesign Level: ${controls.modernLevel}/100 (high-end minimalism, clean crisp lines, cubic cantilevered volumes).
- Luxury Level: ${controls.luxuryLevel}/100.
- Roof Style: ${controls.roofStyle}.
- Window Profile: Massive ${controls.windowSize} architectural glass windows.
- Main Wall Materials: Combination of structural ${controls.wallMaterial}.
- Exterior Paint Theme: Elegant ${controls.paintColor}.
${featuresList.length > 0 ? `- Luxury features added: ${featuresList.join(", ")}.` : ""}

Please render a stunning architectural masterpiece set in dramatic golden hour sunset lighting with realistic shadows, beautiful depth of field, and perfect perspective.
`;

    const client = getGeminiClient();

    if (!client) {
      console.warn("GEMINI_API_KEY is not configured or placeholder detected. Falling back to premium rendering simulation.");
      // We return success: true but flag that we used a beautiful simulation, or we can just return a simulated high-quality modern render.
      return res.json({
        success: true,
        simulated: true,
        message: "Gemini client offline. Standard premium high-fidelity mockup returned.",
        promptText,
      });
    }

    let response: GenerateContentResponse;

    if (image && mimeType) {
      // Image-to-Image Redesign using gemini-2.5-flash-image
      const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");
      response = await client.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType,
              },
            },
            {
              text: `Redesign the uploaded traditional house structure shown in the photo, turning it into the modern architectural masterpiece described here. Ensure you match the perspective, camera angle, and background context of the original image, but completely replace the traditional windows, roof, walls, and details with these modern premium equivalents. Ensure there are clean lines and high-contrast textures: ${promptText}. The output must contain ONLY the redesigned house image.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });
    } else {
      // Text-to-Image Generation from Scratch
      response = await client.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              text: `Generate a brand new modern house. Details: ${promptText}. The output must contain ONLY the generated modern house image.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });
    }

    // Extract the generated base64 image
    let generatedImageBase64: string | null = null;
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageBase64 = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (generatedImageBase64) {
      return res.json({ success: true, image: generatedImageBase64 });
    } else {
      console.error("Gemini model didn't return inline image data. Response parts:", response);
      return res.status(500).json({ error: "Failed to extract image from Gemini response. Falling back to simulation." });
    }

  } catch (error: any) {
    console.error("Error during redesign API call:", error);
    return res.status(500).json({
      error: error?.message || "An internal error occurred during the AI redesign process.",
    });
  }
});

// Configure Vite or Static Serve
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI House Redesign Studio full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
