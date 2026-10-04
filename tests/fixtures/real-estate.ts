import { estateBriefSchema } from "@/lib/real-estate/schema";
export const estateBrief = estateBriefSchema.parse({ title: "Maple Court", agent: "Example Agency", contact: "example.com", rooms: [
  { assetId: "10000000-0000-4000-8000-000000000001", label: "Living room", narration: "A bright living space with room to relax.", motion: "push" },
  { assetId: "10000000-0000-4000-8000-000000000002", label: "Kitchen", narration: "Take a closer look at the kitchen.", motion: "pan" },
] });
