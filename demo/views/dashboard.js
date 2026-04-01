// ── Dashboard view (placeholder) ──────────────────────────────────────────────
// Ready to be filled with real cards. Currently shows a welcome card and
// quick-links to the other sections.

export function mount(outlet, ctx) {
  const brand = ctx.getSelectedBrandMeta();

  outlet.innerHTML = `
    <section class="page">
      <section class="surface-card page-header-card">
        <div class="page-head">
          <div>
            <p class="eyebrow">Marketer Workspace</p>
            <h2>Welcome, ${brand?.name || "Marketer"}</h2>
            <p>Your brand workspace. Use the sidebar to access Chat or the Knowledge Editor.</p>
          </div>
        </div>
      </section>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.25rem;">
        <a href="#chat" class="surface-card dashboard-card" style="text-decoration:none;display:block;padding:1.5rem;transition:box-shadow .15s">
          <p class="eyebrow subtle" style="margin-bottom:.5rem">Chat</p>
          <h3 style="margin:0 0 .5rem;font-size:1.1rem">Marketing Assistant</h3>
          <p style="margin:0;color:var(--muted);font-size:.84rem">Ask questions, generate campaign ideas, and explore brand strategy.</p>
        </a>
        <a href="#knowledge-editor" class="surface-card dashboard-card" style="text-decoration:none;display:block;padding:1.5rem;transition:box-shadow .15s">
          <p class="eyebrow subtle" style="margin-bottom:.5rem">Knowledge Editor</p>
          <h3 style="margin:0 0 .5rem;font-size:1.1rem">Brand Knowledge</h3>
          <p style="margin:0;color:var(--muted);font-size:.84rem">View and edit your brand's knowledge files used by the AI agents.</p>
        </a>
      </div>
    </section>`;

  // Hover effect on cards
  outlet.querySelectorAll(".dashboard-card").forEach((card) => {
    card.addEventListener("mouseenter", () => { card.style.boxShadow = "var(--shadow-md)"; });
    card.addEventListener("mouseleave", () => { card.style.boxShadow = ""; });
  });
}

export function unmount() {}

export function onBrandChange() {
  const h2 = document.querySelector("#view-outlet h2");
  // re-mount would be cleaner but a simple label update is fine for a placeholder
  const brandName = document.getElementById("brandId")?.options[document.getElementById("brandId")?.selectedIndex]?.text;
  if (h2 && brandName) h2.textContent = `Welcome, ${brandName}`;
}
