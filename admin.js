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
  let enEdition = null; // identifiant du texte en cours de modification (on ne rafraîchit pas la liste sous les doigts de l'admin)

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
    enEdition = null;
    try {
      await recharger();
    } catch (e) {
      if (e instanceof ErreurCode) montrerConnexion("Code refusé : reconnecte-toi.");
      else info(e.message, true);
    }
  }
  document.getElementById("actualiser").addEventListener("click", actualiser);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !elTableau.hidden && !enEdition) actualiser();
  });

  /* ---------- Affichage ---------- */

  const nb = (statut) => textes.filter((t) => t.statut === statut).length;

  function afficher() {
    enEdition = null; // tout nouvel affichage referme les formulaires de modification
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
    actions.push(boutonModifier(t, carte), suppression(t));
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

  /* ---------- Modification ---------- */

  const CHAMPS_LISTES = [
    ["format", "Format", () => CONFIG.FORMATS],
    ["echeance", "Échéance", () => CONFIG.ECHEANCES],
    ["type", "Type de scène", () => CONFIG.TYPES],
    ["siecle", "Siècle", () => CONFIG.SIECLES],
    ["registre", "Registre", () => CONFIG.REGISTRES]
  ];

  function boutonModifier(t, carte) {
    const b = el("button", "secondaire", "Modifier");
    b.type = "button";
    b.addEventListener("click", () => {
      const ouvert = carte.querySelector(".edition");
      if (ouvert) {
        ouvert.remove();
        enEdition = null;
        return;
      }
      enEdition = t.id;
      carte.appendChild(formulaireEdition(t));
      carte.querySelector(".edition input")?.focus();
    });
    return b;
  }

  function champTexte(nom, libelle, valeur, max) {
    const label = el("label", "champ", libelle);
    const input = el("input");
    input.name = nom;
    input.value = valeur;
    input.maxLength = max;
    input.required = true;
    label.appendChild(input);
    return label;
  }

  function champListe(nom, libelle, valeurs, courante) {
    const label = el("label", "champ", libelle);
    const select = el("select");
    select.name = nom;
    select.required = true;
    // Une ancienne valeur absente des listes (ajoutée à la main dans le Sheet) oblige à en choisir une valide.
    if (!valeurs.includes(courante)) select.appendChild(new Option(courante ? `${courante} (à corriger)` : "Choisir…", "", true, true));
    for (const v of valeurs) select.appendChild(new Option(v, v, false, v === courante));
    label.appendChild(select);
    return label;
  }

  function formulaireEdition(t) {
    const form = el("form", "edition");
    form.autocomplete = "off";
    form.append(
      champTexte("titre", "Titre", t.titre, 150),
      champTexte("auteur", "Auteur·ice (ou réalisateur·ice)", t.auteur, 100),
      champTexte("personnages", "Personnage(s)", t.personnages, 150)
    );
    const [formatNom, formatLibelle, formatValeurs] = CHAMPS_LISTES[0];
    form.appendChild(champListe(formatNom, formatLibelle, formatValeurs(), t[formatNom])); // pleine largeur : « Pièce de théâtre » est long
    const grille = el("div", "grille2");
    for (const [nom, libelle, valeurs] of CHAMPS_LISTES.slice(1)) grille.appendChild(champListe(nom, libelle, valeurs(), t[nom]));
    const duree = champTexte("duree", "Durée (minutes)", t.duree, 6);
    duree.firstElementChild.type = "number";
    duree.firstElementChild.min = "1";
    duree.firstElementChild.max = "60";
    duree.firstElementChild.step = "any";
    duree.firstElementChild.inputMode = "decimal";
    grille.appendChild(duree);
    form.appendChild(grille);

    const statut = el("p", "admin-erreur");
    statut.setAttribute("role", "alert");
    const actions = el("div", "actions");
    const annuler = el("button", "secondaire", "Annuler");
    annuler.type = "button";
    annuler.addEventListener("click", () => { enEdition = null; form.remove(); });
    const enregistrer = el("button", "principal", "Enregistrer");
    enregistrer.type = "submit";
    actions.append(annuler, enregistrer);
    form.append(statut, actions);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      enregistrer.disabled = true;
      statut.textContent = "";
      const champs = {};
      for (const nom of ["titre", "auteur", "personnages", "format", "echeance", "type", "siecle", "registre", "duree"]) champs[nom] = form.elements[nom].value.trim();
      try {
        const j = await appeler("admin_modifier", { id: t.id, champs });
        Object.assign(t, j.champs);
        enEdition = null;
        afficher();
      } catch (err) {
        if (err instanceof ErreurCode) montrerConnexion("Code refusé : reconnecte-toi.");
        else statut.textContent = err.message;
        enregistrer.disabled = false;
      }
    });
    return form;
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

  /* ---------- Échéance ---------- */

  const elSections = document.getElementById("sections");
  const elPanneauTextes = document.getElementById("panneau-textes");
  const elPanneauEcheance = document.getElementById("panneau-echeance");
  const elEchInfo = document.getElementById("ech-info");
  let section = "textes";

  function afficherSections() {
    elSections.replaceChildren(...[["textes", "Textes"], ["echeance", "Échéance"]].map(([cle, libelle]) => {
      const b = el("button", cle === section ? "chip actif" : "chip", libelle);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(cle === section));
      b.addEventListener("click", () => {
        section = cle;
        afficherSections();
        elPanneauTextes.hidden = cle !== "textes";
        elPanneauEcheance.hidden = cle !== "echeance";
        if (cle === "echeance") chargerEcheance();
      });
      return b;
    }));
  }

  function infoEcheance(texte, erreur = false) {
    elEchInfo.textContent = texte;
    elEchInfo.classList.toggle("erreur", erreur);
    elEchInfo.hidden = !texte;
  }

  // Appel + affichage ; une erreur (Sheet inaccessible, liste illisible…) s'affiche sans rien casser.
  async function actionEcheance(action, donnees) {
    infoEcheance("");
    try {
      afficherEcheance(await appeler(action, donnees));
      return true;
    } catch (e) {
      if (e instanceof ErreurCode) montrerConnexion("Code refusé : reconnecte-toi.");
      else infoEcheance(e.message, true);
      return false;
    }
  }
  const chargerEcheance = () => actionEcheance("admin_passages");

  function afficherEcheance(j) {
    const etat = document.getElementById("ech-etat");
    document.getElementById("ech-bloc-prof").hidden = !j.configure;
    if (!j.configure) {
      etat.textContent = "Aucun Sheet relié pour l’instant. Colle le lien du Sheet de la classe (partagé avec le lien).";
      document.getElementById("ech-rapprocher").hidden = true;
      document.getElementById("ech-absents").hidden = true;
      return;
    }
    etat.textContent = `Relié : « ${j.titre} » — ${j.onglets.map((o) => `${o.nom} : ${o.nb} passage${o.nb > 1 ? "s" : ""}`).join(", ")}.`;
    document.getElementById("ech-prof-etat").textContent = j.profCount
      ? `${j.profCount} lignes dans la liste du prof.`
      : "Pas encore de liste : les noms s’affichent comme dans le Sheet, sans le texte joué.";

    const blocRap = document.getElementById("ech-rapprocher");
    blocRap.hidden = j.aRapprocher.length === 0;
    document.getElementById("ech-rapprocher-liste").replaceChildren(...j.aRapprocher.map((r) => {
      const ligne = el("div", "ech-ligne");
      ligne.appendChild(el("p", "", `${r.groupe} · n°${r.ordre} · « ${r.comedien} » (${r.raison === "ambigu" ? "plusieurs possibles" : "nom inconnu"})`));
      const select = el("select");
      select.setAttribute("aria-label", `Qui est « ${r.comedien} » ?`);
      select.appendChild(new Option("Choisir la personne…", "", true, true));
      select.options[0].disabled = true;
      for (const nom of r.candidats) select.appendChild(new Option(nom, nom));
      select.addEventListener("change", () => actionEcheance("admin_passages_alias", { cle: r.cle, nom: select.value }));
      ligne.appendChild(select);
      return ligne;
    }));

    const blocAbs = document.getElementById("ech-absents");
    blocAbs.hidden = j.absents.length === 0;
    document.getElementById("ech-absents-liste").replaceChildren(...j.absents.map((a) => {
      const li = el("li");
      li.append(el("b", "", a.nom), el("span", "", a.texte), el("small", "", a.groupe));
      return li;
    }));
  }

  document.getElementById("form-sheet").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = e.target.querySelector("button");
    bouton.disabled = true;
    if (await actionEcheance("admin_passages_sheet", { url: document.getElementById("ech-url").value.trim() })) {
      document.getElementById("ech-url").value = "";
      infoEcheance("Lien enregistré. Si c’est une nouvelle échéance, colle maintenant la liste du prof.");
    }
    bouton.disabled = false;
  });
  document.getElementById("form-prof").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = e.target.querySelector("button");
    bouton.disabled = true;
    if (await actionEcheance("admin_passages_prof", { texte: document.getElementById("ech-prof").value })) {
      document.getElementById("ech-prof").value = "";
      infoEcheance("Liste importée.");
    }
    bouton.disabled = false;
  });

  afficherSections();

  /* ---------- Démarrage ---------- */

  if (!CONFIG.LIEN_CSV && !CONFIG.LIEN_ENVOI) {
    montrerConnexion("Le serveur n’est pas configuré (config.js).");
  } else if (lireCode()) {
    connecter(lireCode(), true);
  }
})();
