import { LoginFormEnhanced } from "@/components/login-form-enhanced";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | AI Tax Assistant",
  description: "Sign in to your AI Tax Assistant account to access AI-powered legal and tax analysis tools.",
};

export default function LoginPage() {
  return <LoginFormEnhanced />;
}
