const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const envPath = path.join(rootDir, ".env");
const port = Number(process.env.PORT || readEnvFile().PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

const fallbackMedia = [
  {
    id: "fallback-1",
    caption: "Mercedes elegant ne gjendje shume te mire. Shembull postimi derisa te lidhet API zyrtare.",
    media_type: "IMAGE",
    media_url: "logo.jpg",
    permalink: "https://www.instagram.com/autoshasha/",
    timestamp: "2026-04-16T12:00:00+00:00"
  },
  {
    id: "fallback-2",
    caption: "BMW me pamje sportive dhe prezantim premium ne web.",
    media_type: "IMAGE",
    media_url: "logo.jpg",
    permalink: "https://www.instagram.com/autoshasha/",
    timestamp: "2026-04-15T12:00:00+00:00"
  },
  {
    id: "fallback-3",
    caption: "Porosi nga Korea e Jugut sipas kerkeses se klientit.",
    media_type: "IMAGE",
    media_url: "logo.jpg",
    permalink: "https://www.instagram.com/autoshasha/",
    timestamp: "2026-04-14T12:00:00+00:00"
  }
];

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/instagram-media") {
    const payload = await getInstagramMedia();
    return sendJson(res, 200, payload);
  }

  if (requestUrl.pathname === "/api/contact" && req.method === "POST") {
    const payload = await saveContactLead(req);
    return sendJson(res, payload.ok ? 200 : 500, payload);
  }

  serveStaticFile(requestUrl.pathname, res);
});

server.listen(port, () => {
  console.log(`Auto SHASHA server running at http://localhost:${port}`);
});

function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = normalizeEnvValue(trimmed.slice(separatorIndex + 1).trim());
    env[key] = value;
  }

  return env;
}

function normalizeEnvValue(value) {
  if (!value) {
    return value;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value.trim();
}

async function getInstagramMedia() {
  const env = { ...readEnvFile(), ...process.env };
  const accessToken = normalizeEnvValue(env.INSTAGRAM_ACCESS_TOKEN || "");
  const businessAccountId = normalizeEnvValue(env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "");

  if (!accessToken || !businessAccountId) {
    return {
      source: "fallback",
      connected: false,
      message: "Vendos INSTAGRAM_ACCESS_TOKEN dhe INSTAGRAM_BUSINESS_ACCOUNT_ID ne skedarin .env",
      items: fallbackMedia
    };
  }

  try {
    const items = [];
    let nextUrl = new URL(`https://graph.facebook.com/v23.0/${businessAccountId}/media`);
    nextUrl.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
    nextUrl.searchParams.set("limit", "25");
    nextUrl.searchParams.set("access_token", accessToken);

    while (nextUrl && items.length < 100) {
      const response = await fetch(nextUrl);
      const data = await response.json();

      if (!response.ok || data.error) {
        return {
          source: "error",
          connected: false,
          message: data.error?.message || "Deshtoi leximi i postimeve nga Instagram API",
          debug: {
            status: response.status,
            code: data.error?.code,
            type: data.error?.type
          },
          items: fallbackMedia
        };
      }

      items.push(...(data.data || []));
      nextUrl = data.paging?.next ? new URL(data.paging.next) : null;
    }

    return {
      source: "instagram",
      connected: true,
      message: `Postimet po lexohen nga Instagram Graph API. U ngarkuan ${items.length} postime.`,
      debug: {
        total: items.length
      },
      items
    };
  } catch (error) {
    return {
      source: "error",
      connected: false,
      message: `Gabim gjate lidhjes me Instagram API: ${error.message}`,
      debug: {
        type: error.name
      },
      items: fallbackMedia
    };
  }
}

async function saveContactLead(req) {
  const env = { ...readEnvFile(), ...process.env };
  const supabaseUrl = normalizeEnvValue(env.SUPABASE_URL || "");
  const supabaseKey = normalizeEnvValue(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "");
  const supabaseTable = normalizeEnvValue(env.SUPABASE_CONTACT_TABLE || "contact_leads");

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      message: "Vendos SUPABASE_URL dhe SUPABASE_SERVICE_ROLE_KEY ne .env per ta ruajtur formen."
    };
  }

  try {
    const rawBody = await readRequestBody(req);
    const body = JSON.parse(rawBody || "{}");
    const lead = {
      name: String(body.name || "").trim(),
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
      message: String(body.message || "").trim(),
      source: "website",
      created_at: new Date().toISOString()
    };

    if (!lead.name || !lead.email || !lead.phone || !lead.message) {
      return {
        ok: false,
        message: "Te gjitha fushat jane te detyrueshme."
      };
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify([lead])
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message: result?.message || result?.error || "Deshtoi ruajtja e formes ne Supabase."
      };
    }

    const emailResult = await sendContactNotificationEmail(lead, env);

    return {
      ok: true,
      message: emailResult.ok
        ? "Kerkesa u ruajt me sukses dhe emaili u dergua te pronari."
        : `Kerkesa u ruajt me sukses ne Supabase. ${emailResult.message}`,
      data: result,
      email: emailResult
    };
  } catch (error) {
    return {
      ok: false,
      message: `Gabim gjate dergimit te formes: ${error.message}`
    };
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function sendContactNotificationEmail(lead, env) {
  const resendApiKey = normalizeEnvValue(env.RESEND_API_KEY || "");
  const ownerEmail = normalizeEnvValue(env.CONTACT_OWNER_EMAIL || "");
  const fromEmail = normalizeEnvValue(env.CONTACT_FROM_EMAIL || "");

  if (!resendApiKey || !ownerEmail || !fromEmail) {
    return {
      ok: false,
      message: "Email notification nuk eshte aktivizuar ende. Vendos RESEND_API_KEY, CONTACT_OWNER_EMAIL dhe CONTACT_FROM_EMAIL ne .env."
    };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>Porosi e re nga Auto SHASHA</h2>
      <p><strong>Emri:</strong> ${escapeHtmlForEmail(lead.name)}</p>
      <p><strong>Email:</strong> ${escapeHtmlForEmail(lead.email)}</p>
      <p><strong>Telefoni:</strong> ${escapeHtmlForEmail(lead.phone)}</p>
      <p><strong>Mesazhi:</strong><br>${escapeHtmlForEmail(lead.message).replaceAll("\n", "<br>")}</p>
      <p><strong>Burimi:</strong> Website Auto SHASHA</p>
      <p><strong>Data:</strong> ${escapeHtmlForEmail(lead.created_at)}</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [ownerEmail],
        subject: "Porosi e re nga klienti - Auto SHASHA",
        reply_to: lead.email,
        html
      })
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message: result?.message || result?.error || "Deshtoi dergimi i emailit."
      };
    }

    return {
      ok: true,
      id: result?.id || null
    };
  } catch (error) {
    return {
      ok: false,
      message: `Gabim gjate dergimit te emailit: ${error.message}`
    };
  }
}

function escapeHtmlForEmail(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serveStaticFile(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(rootDir, safePath));

  if (!filePath.startsWith(rootDir)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendText(res, 404, "Not found");
      }

      return sendText(res, 500, "Server error");
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
    res.end(content);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
