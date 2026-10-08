import type { NextConfig } from "next";
// tesseract.js (leitura local dos prints do trabalho) roda em worker_threads e
// carrega arquivos do próprio pacote: fica fora do bundle.
const nextConfig: NextConfig = { output: "standalone", serverExternalPackages: ["tesseract.js", "tesseract.js-core"] };
export default nextConfig;
