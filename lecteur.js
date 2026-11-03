// Lecteur de PDF intégré : le texte s'affiche dans l'appli au lieu d'envoyer vers une page tierce.
// Les pages sont dessinées avec pdf.js (dossier vendor/), seulement quand elles approchent de l'écran.
// Le bouton « Enregistrer » ouvre la feuille de partage du téléphone (Fichiers, Drive, AirDrop…), ou télécharge sur ordinateur.
// Utilisé par le catalogue (script.js) et par la page admin (admin.js).
(() => {
  const DPR_MAX = 2;
  const MARGE_PRELOAD = "1400px 0px";

  // Reconnaît d'où vient le PDF : { type: "drive", id } (stocké par le serveur), { type: "local", url } (fichier du site) ou null.
  function sourcePdf(lien) {
    let u;
    try { u = new URL(lien, location.href); } catch { return null; }
    if (/(^|\.)(drive|docs)\.google\.com$/.test(u.hostname)) {
      const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] || u.searchParams.get("id");
      return id && /^[\w-]{10,}$/.test(id) ? { type: "drive", id } : null;
    }
    if (u.origin === location.origin && /\.pdf$/i.test(u.pathname)) return { type: "local", url: u.href };
    return null;
  }

  const decoderBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  async function chargerOctets(source, code) {
    if (source.type === "local") {
      const r = await fetch(source.url);
      if (!r.ok) throw new Error("Fichier introuvable.");
      return { octets: new Uint8Array(await r.arrayBuffer()) };
    }
    const r = await fetch(CONFIG.LIEN_CSV, { method: "POST", body: JSON.stringify({ action: "pdf", code, id: source.id }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erreur || "Impossible d’ouvrir ce PDF.");
    return { octets: decoderBase64(j.donnees) };
  }

  /* ---------- Fenêtre ---------- */

  let dialogue = null;
  let zone, titreEl, statutEl, repliEl, boutonEnreg;
  let session = 0; // chaque ouverture a son numéro : une réponse tardive d'un ancien texte est ignorée
  let courant = null; // { doc, octets, nom, observateur, pages }

  function icone(nom) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${nom}`);
    svg.appendChild(use);
    return svg;
  }

  function construire() {
    dialogue = document.createElement("dialog");
    dialogue.className = "feuille lecteur";
    dialogue.setAttribute("aria-labelledby", "lecteur-titre");

    const tete = document.createElement("div");
    tete.className = "feuille-tete lecteur-tete";
    titreEl = document.createElement("h2");
    titreEl.id = "lecteur-titre";

    boutonEnreg = document.createElement("button");
    boutonEnreg.type = "button";
    boutonEnreg.className = "chip lecteur-enreg";
    boutonEnreg.hidden = true;
    boutonEnreg.append(icone("partager"), Object.assign(document.createElement("span"), { textContent: "Enregistrer" }));
    boutonEnreg.addEventListener("click", enregistrer);

    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "fermer";
    fermer.setAttribute("aria-label", "Fermer");
    fermer.appendChild(icone("fermer"));
    fermer.addEventListener("click", () => dialogue.close());
    tete.append(titreEl, boutonEnreg, fermer);

    zone = document.createElement("div");
    zone.className = "lecteur-pages";

    statutEl = document.createElement("p");
    statutEl.className = "lecteur-statut";
    statutEl.setAttribute("role", "status");
    repliEl = document.createElement("a");
    repliEl.className = "lien";
    repliEl.target = "_blank";
    repliEl.rel = "noopener";
    repliEl.textContent = "Essayer d’ouvrir le lien d’origine";
    repliEl.hidden = true;

    dialogue.append(tete, zone, statutEl, repliEl);
    document.body.appendChild(dialogue);
    dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });
    dialogue.addEventListener("close", nettoyer);
  }

  function nettoyer() {
    session++;
    if (courant) {
      courant.observateur?.disconnect();
      courant.doc?.destroy();
      courant = null;
    }
    zone.replaceChildren();
    boutonEnreg.hidden = true;
  }

  function dire(texte, erreur = false, lien = "") {
    statutEl.textContent = texte;
    statutEl.classList.toggle("erreur", erreur);
    statutEl.hidden = !texte;
    const href = erreur ? lienHttp(lien) : "";
    repliEl.hidden = !href;
    if (href) repliEl.href = href;
  }

  function lienHttp(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
      return "";
    }
  }

  /* ---------- Dessin des pages ---------- */

  async function dessiner(octets, numero) {
    const pdfjs = await import("./vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", document.baseURI).href;
    // pdf.js « consomme » le tableau qu'on lui donne : on lui en passe une copie, l'original sert à enregistrer.
    const doc = await pdfjs.getDocument({ data: octets.slice(), isEvalSupported: false }).promise;
    if (numero !== session) { doc.destroy(); return; }

    const premiere = await doc.getPage(1);
    const base = premiere.getViewport({ scale: 1 });
    const largeur = zone.clientWidth || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);

    const pages = [];
    const fragment = document.createDocumentFragment();
    for (let i = 1; i <= doc.numPages; i++) {
      const cadre = document.createElement("div");
      cadre.className = "page-pdf";
      cadre.style.aspectRatio = `${base.width} / ${base.height}`;
      cadre.dataset.n = String(i);
      const canvas = document.createElement("canvas");
      cadre.appendChild(canvas);
      pages[i] = { cadre, canvas, tache: null, rendue: false };
      fragment.appendChild(cadre);
    }
    zone.replaceChildren(fragment);

    async function rendre(i) {
      const p = pages[i];
      if (p.rendue) return;
      p.rendue = true;
      try {
        const page = await doc.getPage(i);
        if (!p.rendue || numero !== session) return;
        const vue = page.getViewport({ scale: 1 });
        const echelle = (zone.clientWidth || largeur) / vue.width * dpr;
        const vp = page.getViewport({ scale: echelle });
        p.cadre.style.aspectRatio = `${vue.width} / ${vue.height}`;
        p.canvas.width = Math.floor(vp.width);
        p.canvas.height = Math.floor(vp.height);
        p.tache = page.render({ canvasContext: p.canvas.getContext("2d"), viewport: vp });
        await p.tache.promise;
      } catch (e) {
        if (e?.name !== "RenderingCancelledException") p.rendue = false; // on réessaiera au prochain passage
      }
    }
    // Page loin de l'écran : on libère sa mémoire (un PDF de 80 pages ferait planter Safari sinon).
    function liberer(i) {
      const p = pages[i];
      p.rendue = false;
      p.tache?.cancel();
      p.tache = null;
      p.canvas.width = p.canvas.height = 0;
    }

    const observateur = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        const i = Number(e.target.dataset.n);
        if (e.isIntersecting) rendre(i); else liberer(i);
      }
    }, { root: zone, rootMargin: MARGE_PRELOAD });
    for (let i = 1; i < pages.length; i++) observateur.observe(pages[i].cadre);

    courant = { doc, observateur, octets };
  }

  /* ---------- Enregistrer / partager ---------- */

  async function enregistrer() {
    if (!courant) return;
    const nom = courant.nom;
    const fichier = new File([courant.octets], nom, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: titreEl.textContent });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // l'utilisateur a refermé la feuille de partage
      }
    }
    const url = URL.createObjectURL(fichier);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  const nomFichier = (titre) => (String(titre).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "texte") + ".pdf";

  /* ---------- Ouverture ---------- */

  // { titre, lien, code } : « code » est le code de la classe (ou celui de l'admin).
  async function ouvrir({ titre, lien, code }) {
    if (!dialogue) construire();
    const source = sourcePdf(lien);
    nettoyer();
    const numero = session;
    titreEl.textContent = titre;
    dire("Ouverture du texte…");
    if (!dialogue.open) (typeof ouvrirFeuille === "function" ? ouvrirFeuille : (d) => d.showModal())(dialogue);

    try {
      if (!source) throw new Error("Ce lien n’est pas un PDF.");
      const { octets } = await chargerOctets(source, code);
      if (numero !== session) return;
      await dessiner(octets, numero);
      if (numero !== session) return;
      courant.nom = nomFichier(titre);
      boutonEnreg.hidden = false;
      dire("");
    } catch (e) {
      if (numero !== session) return;
      const hors = !navigator.onLine || e instanceof TypeError;
      dire(hors ? "Pas de connexion : le texte ne peut pas s’ouvrir pour l’instant." : e.message || "Impossible d’ouvrir ce texte.", true, lien);
    }
  }

  window.Lecteur = { ouvrir, sourcePdf };
})();
