import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/account", "/settings", "/reports/", "/history", "/inventory", "/extensions/"],
    },
    sitemap: "https://abscissa.dev/sitemap.xml",
    host: "https://abscissa.dev",
  };
}
