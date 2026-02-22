import { LoginFormEnhanced } from "@/components/login-form-enhanced";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Juddges",
  description: "Sign in to your Juddges account to access AI-powered judgments analysis and extraction tools.",
};

export default function LoginPage() {
  return <LoginFormEnhanced />;
}
