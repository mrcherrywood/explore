import Chat from "@/components/Chat";
import { redirect } from "next/navigation";

export const metadata = {
  title: "AI Assistant • Program Insight Studio",
  description: "Chat with AI to analyze Medicare Advantage data and generate insights.",
};

export default function ChatPage() {
  const showAiAssistant = false;
  if (!showAiAssistant) {
    redirect("/data");
  }
  return <Chat />;
}
