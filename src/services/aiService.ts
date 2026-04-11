import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getAIAssistance(prompt: string, context: any) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          text: `Você é um assistente inteligente do Hub Operacional GD4. 
          Contexto atual do sistema: ${JSON.stringify(context)}
          
          Pergunta do usuário: ${prompt}
          
          Responda de forma concisa e profissional. Se o usuário pedir para organizar a agenda ou sugerir tarefas, forneça sugestões baseadas nos dados de empreiteiras bloqueadas ou pendentes.`
        }
      ],
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });

    return response.text;
  } catch (error) {
    console.error("AI Service Error:", error);
    return "Desculpe, tive um problema ao processar sua solicitação agora.";
  }
}

export async function suggestTasks(contractors: any[]) {
  const criticalContractors = contractors.filter(c => c.status === 'BLOQUEADO' || c.status === 'PENDENTE');
  
  if (criticalContractors.length === 0) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          text: `Com base nestas empreiteiras críticas: ${JSON.stringify(criticalContractors)}, 
          sugira 3 tarefas prioritárias para a agenda. 
          Retorne em formato JSON.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["VISITA", "REUNIAO", "REGULARIZACAO", "AUDITORIA"] },
              contractorId: { type: Type.STRING }
            },
            required: ["title", "description", "type"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    return null;
  }
}
