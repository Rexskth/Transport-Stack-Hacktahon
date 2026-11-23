/** Static export: `npm run build` writes plain files to ./out, which `npm run deploy` copies into ../web
 *  so the Python API serves the UI and nobody needs Node to run the project. */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
