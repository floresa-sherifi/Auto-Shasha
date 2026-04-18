const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const instagramGrid = document.querySelector("#instagram-grid");
const instagramStatus = document.querySelector("#instagram-status");
const instagramLoadMore = document.querySelector("#instagram-load-more");
const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-status");
const contactSubmit = document.querySelector("#contact-submit");
const initialInstagramItems = 9;
let instagramItemsState = [];
let instagramVisibleCount = initialInstagramItems;
let instagramIsConnected = false;

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("is-open");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

loadInstagramFeed();
setupContactForm();

async function loadInstagramFeed() {
  if (!instagramGrid || !instagramStatus) {
    return;
  }

  if (window.location.protocol === "file:") {
    instagramStatus.textContent = "Faqja eshte hapur si skedar lokal. Nise me `node server.js` dhe hape nga `http://localhost:3001` qe te shfaqen postimet.";
    instagramItemsState = [];
    instagramVisibleCount = initialInstagramItems;
    instagramIsConnected = false;
    renderInstagramItems([], false);
    return;
  }

  try {
    const response = await fetch("/api/instagram-media");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Deshtoi ngarkimi i postimeve nga serveri.");
    }

    instagramStatus.textContent = payload.connected ? "" : (payload.message || "Postimet u ngarkuan.");
    instagramItemsState = payload.items || [];
    instagramVisibleCount = initialInstagramItems;
    instagramIsConnected = Boolean(payload.connected);
    renderInstagramItems(instagramItemsState, instagramIsConnected);
  } catch (error) {
    instagramStatus.textContent = error.message || "Nuk u arrit lidhja me API. Po shfaqet pamja rezerve.";
    instagramItemsState = [];
    instagramVisibleCount = initialInstagramItems;
    instagramIsConnected = false;
    renderInstagramItems([], false);
  }
}

function renderInstagramItems(items, connected) {
  if (!instagramGrid) {
    return;
  }

  const normalizedItems = items.length > 0 ? items : [
    {
      id: "empty-state",
      caption: "Kur te lidhet Instagram API, postimet e fundit do te shfaqen automatikisht ketu.",
      media_type: "IMAGE",
      media_url: "logo.jpg",
      permalink: "https://www.instagram.com/autoshasha/",
      timestamp: new Date().toISOString()
    }
  ];

  const itemsToRender = normalizedItems.slice(0, instagramVisibleCount);

  instagramGrid.innerHTML = itemsToRender.map((item) => {
    const mediaUrl = resolveMediaUrl(item);
    const caption = escapeHtml(item.caption || "Postim nga Auto SHASHA");
    const dateText = formatDate(item.timestamp);
    const mediaType = escapeHtml(item.media_type || "POST");
    const placeholderBadge = connected ? "" : `<span class="instagram-fallback-badge">Demo</span>`;

    return `
      <article class="instagram-card">
        <a class="instagram-media-link" href="${item.permalink}" target="_blank" rel="noreferrer">
          <img class="instagram-media" src="${mediaUrl}" alt="Postim i Auto SHASHA" loading="lazy">
          ${placeholderBadge}
        </a>
        <div class="instagram-body">
          <div class="instagram-meta">
            <span>${mediaType}</span>
            <span>${dateText}</span>
          </div>
          <p>${caption}</p>
          <a class="instagram-link" href="${item.permalink}" target="_blank" rel="noreferrer">Shiko postimin</a>
        </div>
      </article>
    `;
  }).join("");

  updateLoadMoreButton(normalizedItems.length);
}

if (instagramLoadMore) {
  instagramLoadMore.addEventListener("click", () => {
    instagramVisibleCount += 9;
    renderInstagramItems(instagramItemsState, instagramIsConnected);
  });
}

function updateLoadMoreButton(totalItems) {
  if (!instagramLoadMore) {
    return;
  }

  const shouldShow = totalItems > instagramVisibleCount;
  instagramLoadMore.hidden = !shouldShow;
}

function resolveMediaUrl(item) {
  if (!item) {
    return "logo.jpg";
  }

  const rawUrl = item.media_type === "VIDEO" && item.thumbnail_url
    ? item.thumbnail_url
    : (item.media_url || item.thumbnail_url || "logo.jpg");

  if (!rawUrl || rawUrl === "logo.jpg") {
    return "logo.jpg";
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
  }

  return rawUrl;
}

function formatDate(value) {
  if (!value) {
    return "Auto SHASHA";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Auto SHASHA";
  }

  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setupContactForm() {
  if (!contactForm || !contactStatus || !contactSubmit) {
    return;
  }

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      message: String(formData.get("message") || "").trim()
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.message) {
      contactStatus.textContent = "Ploteso te gjitha fushat para dergimit.";
      contactStatus.classList.add("is-error");
      contactStatus.classList.remove("is-success");
      return;
    }

    contactSubmit.disabled = true;
    contactStatus.textContent = "Po dergohet kerkesa...";
    contactStatus.classList.remove("is-error", "is-success");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Deshtoi dergimi i kerkeses.");
      }

      contactStatus.textContent = "Kerkesa u dergua me sukses. Pronari mund ta shoh tani ne Supabase.";
      contactStatus.classList.add("is-success");
      contactStatus.classList.remove("is-error");
      contactForm.reset();
    } catch (error) {
      contactStatus.textContent = error.message || "Ndodhi nje gabim gjate dergimit.";
      contactStatus.classList.add("is-error");
      contactStatus.classList.remove("is-success");
    } finally {
      contactSubmit.disabled = false;
    }
  });
}
