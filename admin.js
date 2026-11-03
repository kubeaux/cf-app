// Page admin : valider ou refuser les textes proposés, retirer un texte, activer l'autopilote.
// Tout passe par le Apps Script (apps-script/Code.gs), qui vérifie le code admin à chaque demande.
(() => {
  const CLE_ADMIN = "la-truculance-admin";

  const ONGLETS = [
    { statut: "attente", titre: "À valider", vide: "Rien à valider. Tout est à jour." },
    { statut: "valide", titre: "Publiés", vide: "Aucun texte publié pour l’instant." },
    { statut: "refuse", titre: "Refusés", vide: "Aucun texte refusé." }
  ];

  const elConnexion = document.getElementById("connexion");
  const elCode = document.getElementById("code-admin");
  const elErreur = document.getElementById("connexion-erreur");
  const elTableau = document.getElementById("tableau");
  const elOnglets = document.getElementById("onglets");
  const elListe = document.getElementById("liste");
  const elCompteur = document.getElementById("compteur");
  const elInfo = document.getElementById("info");
  const elAutoCarte = document.getElementById("auto-carte");
  const elAutoTexte = document.getElementById("auto-texte");
  const elAutoBouton = document.getElementById("auto-interrupteur");
  const elDeconnexion = document.getElementById("deconnexion");

  let code = "";
  let textes = [];
  let auto = false;
  let onglet = "attente";
  let chargement = 0;

  const lireCode = () => { try { return localStorage.getItem(CLE_ADMIN) || ""; } catch { return ""; } };
  const ecrireCode = (v) => { try { localStorage.setItem(CLE_ADMIN, v); } catch {} };
  const oublierCode = () => { try { localStorage.removeItem(CLE_ADMIN); } catch {} };

  function el(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  function lienHttp(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
      return "";
    }
  }

  class ErreurCode extends Error {}

  async function appeler(action, donnees = {}) {
    let j;
    try {
      const r = await fetch(CONFIG.LIEN_ENVOI || CONFIG.LIEN_CSV, { method: "POST", body: JSON.stringify({ action, code, ...donnees }) });
      j = await r.json();
    } catch {
      throw new Error("Pas de connexion au serveur. Réessaie dans un instant.");
    }
    if (j.ok) return j;
    if (j.code) throw new ErreurCode(j.erreur);
    throw new Error(j.erreur || "Le serveur a refusé la demande.");
  }

  function info(texte, erreur = false) {
    elInfo.textContent = texte;
    elInfo.classList.toggle("erreur", erreur);
    elInfo.hidden = !texte;
  }

  /* ---------- Connexion ---------- */

  function montrerConnexion(erreur = "") {
    elTableau.hidden = true;
    elConnexion.hidden = false;
    elDeconnexion.hidden = true;
    elErreur.textContent = erreur;
    elCode.value = "";
  }

  async function connecter(nouveauCode, memorise = false) {
    code = nouveauCode;
    try {
      await recharger();
      ecrireCode(code);
      elConnexion.hidden = true;
      elTableau.hidden = false;
      elDeconnexion.hidden = false;
    } catch (e) {
      code = "";
      if (e instanceof ErreurCode) {
        oublierCode();
        montrerConnexion(memorise ? "Ton code n’est plus valide. Entre-le à nouveau." : "Code incorrect.");
      } else {
        montrerConnexion(e.message);
      }
    }
  }

  elConnexion.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = elConnexion.querySelector("button");
    bouton.disabled = true;
    elErreur.textContent = "";
    await connecter(elCode.value.trim());
    bouton.disabled = false;
  });

  elDeconnexion.addEventListener("click", () => {
    oublierCode();
    code = "";
    textes = [];
    elListe.replaceChildren();
    montrerConnexion();
  });

  /* ---------- Chargement ---------- */

  async function recharger() {
    const numero = ++chargement;
    const j = await appeler("admin_liste");
    if (numero !== chargement) return; // une demande plus récente est partie entre-temps
    textes = j.textes;
    auto = j.auto;
    afficher();
  }

  async function actualiser() {
    info("");
    try {
      await recharger();
    } catch (e) {
      if (e instanceof ErreurCode) montrerConnexion("Code refusé : reconnecte-toi.");
      else info(e.message, true);
    }
  }
  document.getElementById("actualiser").addEventListener("click", actualiser);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !elTableau.hidden) actualiser();
  });

  /* ---------- Affichage ---------- */

  const nb = (statut) => textes.filter((t) => t.statut === statut).length;

  function afficher() {
    // Autopilote
    elAutoBouton.setAttribute("aria-checked", String(auto));
    elAutoCarte.classList.toggle("actif", auto);
    elAutoTexte.textContent = auto
      ? "Activé : les textes proposés sont publiés tout de suite, sans passer par toi. Tu peux toujours en retirer un ici."
      : "Désactivé : chaque texte proposé attend ta validation avant d’apparaître.";

    // Onglets
    elOnglets.replaceChildren(...ONGLETS.map((o) => {
      const b = el("button", o.statut === onglet ? "chip actif" : "chip");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(o.statut === onglet));
      b.append(el("span", "", o.titre), el("b", "", String(nb(o.statut))));
      b.addEventListener("click", () => { onglet = o.statut; afficher(); });
      return b;
    }));

    // Liste
    const liste = textes.filter((t) => t.statut === onglet);
    const def = ONGLETS.find((o) => o.statut === onglet);
    elCompteur.textContent = liste.length ? `${liste.length} texte${liste.length > 1 ? "s" : ""}` : "";
    if (!liste.length) {
      const vide = el("div", "vide");
      vide.appendChild(el("p", "", def.vide));
      elListe.replaceChildren(vide);
      return;
    }
    elListe.replaceChildren(...liste.map(creerCarte));
  }

  function quand(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  function creerCarte(t) {
    const carte = el("article", "carte carte-admin");

    const haut = el("div", "carte-haut");
    haut.appendChild(el("span", "pastille", t.echeance || "Texte"));
    if (t.duree) haut.appendChild(el("span", "duree", `${t.duree} min`));
    carte.append(haut, el("h2", "", t.titre));

    const signature = [t.auteur, t.siecle && `${t.siecle} siècle`].filter(Boolean).join(" · ");
    if (signature) carte.appendChild(el("p", "auteur", signature));
    if (t.personnages) carte.append(el("p", "etiquette", "Personnages"), el("p", "perso", t.personnages));

    const valeursTags = [t.format, t.type, t.registre].filter(Boolean);
    if (valeursTags.length) {
      const tags = el("div", "tags");
      for (const v of valeursTags) tags.appendChild(el("span", "tag", v));
      carte.appendChild(tags);
    }

    const depuis = [t.prenom && `Proposé par ${t.prenom}`, quand(t.date)].filter(Boolean).join(" · ");
    if (depuis) carte.appendChild(el("p", "depuis", depuis));

    const pied = el("div", "carte-pied");
    pied.appendChild(boutonVoir(t));
    const actions = [];
    if (t.statut === "attente") {
      actions.push(action(t, "Valider", "valider", "principal"), action(t, "Refuser", "refuser", "secondaire"));
    } else if (t.statut === "valide") {
      actions.push(action(t, "Retirer du catalogue", "attente", "secondaire"));
    } else {
      actions.push(action(t, "Remettre en attente", "attente", "secondaire"));
    }
    actions.push(suppression(t));
    pied.append(...actions);
    carte.appendChild(pied);
    return carte;
  }

  // « Voir le texte » : dans le lecteur si c'est un PDF, sinon le lien dans un nouvel onglet.
  function boutonVoir(t) {
    const href = lienHttp(t.lien);
    if (!href) return el("span", "indispo", "Aucun lien");
    if (Lecteur.sourcePdf(href)) {
      const b = el("button", "lire", "Voir le texte");
      b.type = "button";
      b.addEventListener("click", () => Lecteur.ouvrir({ titre: t.titre, lien: href, code }));
      return b;
    }
    const a = el("a", "lire", "Ouvrir le lien");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  async function decider(t, decision, boutons) {
    for (const b of boutons) b.disabled = true;
    info("");
    try {
      await appeler("admin_decision", { id: t.id, decision });
      if (decision === "supprimer") textes = textes.filter((x) => x.id !== t.id);
      else t.statut = decision === "valider" ? "valide" : decision === "refuser" ? "refuse" : "attente";
      afficher();
    } catch (e) {
      if (e instanceof ErreurCode) montrerConnexion("Code refusé : reconnecte-toi.");
      else info(e.message, true);
      for (const b of boutons) b.disabled = false;
    }
  }

  function action(t, libelle, decision, classe) {
    const b = el("button", classe, libelle);
    b.type = "button";
    b.addEventListener("click", () => decider(t, decision, b.parentElement.querySelectorAll("button")));
    return b;
  }

  // Suppression définitive : un second appui est nécessaire.
  function suppression(t) {
    const b = el("button", "secondaire danger", "Supprimer");
    b.type = "button";
    let armee = null;
    b.addEventListener("click", () => {
      if (!armee) {
        b.textContent = "Confirmer ?";
        armee = setTimeout(() => { armee = null; b.textContent = "Supprimer"; }, 4000);
        return;
      }
      clearTimeout(armee);
      decider(t, "supprimer", b.parentElement.querySelectorAll("button"));
    });
    return b;
  }

  /* ---------- Autopilote ---------- */

  elAutoBouton.addEventListener("click", async () => {
    const voulu = !auto;
    elAutoBouton.disabled = true;
    info("");
    try {
      const j = await appeler("admin_mode", { auto: voulu });
      auto = j.auto;
      afficher();
      if (auto && nb("attente")) info(`Autopilote activé. Les ${nb("attente")} texte(s) déjà en attente restent à valider à la main.`);
    } catch (e) {
      info(e.message, true);
    } finally {
      elAutoBouton.disabled = false;
    }
  });

  /* ---------- Démarrage ---------- */

  if (!CONFIG.LIEN_CSV && !CONFIG.LIEN_ENVOI) {
    montrerConnexion("Le serveur n’est pas configuré (config.js).");
  } else if (lireCode()) {
    connecter(lireCode(), true);
  }
})();
