import { Layout } from "@/components/Layout";
import { LegalModal } from "@/components/LegalModal";
import { useLocation } from "wouter";

export function Tos() {
  const [, navigate] = useLocation();
  return (
    <>
      <Layout>
        <div />
      </Layout>
      <LegalModal doc="tos" onClose={() => navigate("/")} />
    </>
  );
}
