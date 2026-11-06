// Page « Échéance » : ordre de passage, texte joué, matériel, mise en scène et régie, d'après le Google Sheet de la classe.
// Les données viennent du Apps Script (action « passages »), derrière le code de la classe. Rien n'est écrit ici : on lit seulement.
(() => {
  const CLE_CODE = "la-truculance-code";
  const CLE_CACHE = "la-truculance-passages";
  const CLE_MOI = "la-truculance-moi";
  const ONGLET_MATERIEL = "__materiel";

  const elMessage = document.getElementById("message");
  const elTitre = document.getElementById("titre-echeance");
  const elMoi = document.getElementById("moi");
  const elOnglets = document.getElementById("onglets");
  const elListe = document.getElementById("liste");

  const lire = (cle) => { try { return localStorage.getItem(cle) || ""; } catch { return ""; } };
  const ecrire = (cle, v) => { try { localStorage.setItem(cle, v); } catch {} };
  const oublier = (cle) => { try { localStorage.removeItem(cle); } catch {} };

  function el(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  let donnees = null; // { titre, groupes }
  let onglet = "";
  let moi = lire(CLE_MOI); // clé « personne » choisie par l'élève

  function message(texte, erreur = false) {
    elMessage.textContent = texte;
    elMessage.classList.toggle("erreur", erreur);
    elMessage.hidden = !texte;
  }

  /* ---------- Chargement ---------- */

  async function charger() {
    const code = lire(CLE_CODE);
    if (!code) {
      message("Entre d’abord le code de la classe depuis l’accueil.", true);
      return;
    }
    const copie = lireCopie();
    if (copie) afficher(copie.donnees, `Dernière version enregistrée le ${quand(copie.le)}.`);

    try {
      const reponse = await fetch(CONFIG.LIEN_CSV, { method: "POST", body: JSON.stringify({ action: "passages", code }) });
      const j = await reponse.json();
      if (j.ok && j.vide) {
        donnees = null;
        elOnglets.hidden = true;
        elMoi.hidden = true;
        elListe.replaceChildren();
        message("Pas d’échéance pour l’instant. Reviens bientôt !");
        return;
      }
      if (j.ok) {
        ecrire(CLE_CACHE, JSON.stringify({ le: Date.now(), donnees: { titre: j.titre, groupes: j.groupes } }));
        message("");
        afficher({ titre: j.titre, groupes: j.groupes });
        return;
      }
      if (j.code) {
        message("Le code de la classe n’est plus valide. Entre-le à nouveau depuis l’accueil.", true);
        return;
      }
      throw new Error(j.erreur);
    } catch {
      if (!copie) message("Impossible de charger l’échéance. Vérifie ta connexion.", true);
    }
  }

  function lireCopie() {
    try {
      const c = JSON.parse(lire(CLE_CACHE));
      return c && c.donnees && Array.isArray(c.donnees.groupes) ? c : null;
    } catch {
      return null;
    }
  }

  const quand = (ms) => new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  /* ---------- Affichage ---------- */

  function afficher(d, note = "") {
    donnees = d;
    elTitre.textContent = d.titre || "";
    if (note) message(note);
    if (!onglet || (onglet !== ONGLET_MATERIEL && !d.groupes.some((g) => g.nom === onglet))) onglet = d.groupes[0]?.nom || ONGLET_MATERIEL;
    afficherMoi();
    afficherOnglets();
    afficherListe();
  }

  // Les personnes de la classe, une fois chacune (clé « personne » → nom affiché).
  function personnes() {
    const m = new Map();
    for (const g of donnees.groupes) for (const l of g.lignes) if (!m.has(l.personne)) m.set(l.personne, l.nom);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }

  const decrire = (g, l) => `${g.nom} · n°${l.ordre}`;

  function afficherMoi() {
    elMoi.replaceChildren();
    elMoi.hidden = false;
    if (!moi || !personnes().some(([cle]) => cle === moi)) {
      const label = el("label", "champ", "Qui es-tu ? Ton passage s’affichera ici.");
      const select = el("select");
      select.appendChild(new Option("Choisir mon nom…", "", true, true));
      select.options[0].disabled = true;
      for (const [cle, nom] of personnes()) select.appendChild(new Option(nom, cle));
      select.addEventListener("change", () => {
        moi = select.value;
        ecrire(CLE_MOI, moi);
        afficher(donnees);
      });
      label.appendChild(select);
      elMoi.appendChild(label);
      return;
    }

    const mes = [];
    for (const g of donnees.groupes) for (const l of g.lignes) if (l.personne === moi) mes.push([g, l]);
    const carte = el("article", "carte moi-carte");
    carte.appendChild(el("p", "kicker", "Mon passage"));
    for (const [g, l] of mes) {
      const bloc = el("div", "mon-passage");
      bloc.appendChild(el("p", "mon-num", decrire(g, l)));
      if (l.texte) bloc.appendChild(el("p", "perso", l.texte));
      details(bloc, l);
      carte.appendChild(bloc);
    }
    const autre = el("button", "lien", "Ce n’est pas moi");
    autre.type = "button";
    autre.addEventListener("click", () => { moi = ""; oublier(CLE_MOI); afficher(donnees); });
    carte.appendChild(autre);
    elMoi.appendChild(carte);
  }

  function afficherOnglets() {
    const onglets = [...donnees.groupes.map((g) => [g.nom, g.nom]), [ONGLET_MATERIEL, "Matériel"]];
    elOnglets.hidden = false;
    elOnglets.replaceChildren(...onglets.map(([cle, libelle]) => {
      const b = el("button", cle === onglet ? "chip actif" : "chip", libelle);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(cle === onglet));
      b.addEventListener("click", () => { onglet = cle; afficherOnglets(); afficherListe(); });
      return b;
    }));
  }

  // Matériel, mise en scène et régie d'une ligne (seulement ce qui est renseigné).
  function details(parent, l) {
    const ligne = (titre, valeur) => {
      if (!valeur) return;
      parent.append(el("p", "etiquette", titre), el("p", "detail", valeur));
    };
    ligne("Matériel", l.materiel);
    ligne("Mise en scène", l.mise);
    ligne("Régie", l.regisseurs.join(", "));
  }

  function afficherListe() {
    if (onglet === ONGLET_MATERIEL) {
      afficherMateriel();
      return;
    }
    const g = donnees.groupes.find((x) => x.nom === onglet);
    if (!g || !g.lignes.length) {
      const vide = el("div", "vide");
      vide.appendChild(el("p", "", "Personne dans cet onglet pour l’instant."));
      elListe.replaceChildren(vide);
      return;
    }
    elListe.replaceChildren(...g.lignes.map((l) => {
      const carte = el("article", l.personne === moi ? "carte passage moi" : "carte passage");
      const tete = el("div", "passage-tete");
      tete.appendChild(el("span", "passage-num", l.ordre));
      const qui = el("div", "passage-qui");
      qui.appendChild(el("h2", "", l.nom));
      if (l.texte) qui.appendChild(el("p", "auteur", l.texte));
      tete.appendChild(qui);
      carte.appendChild(tete);
      details(carte, l);
      return carte;
    }));
  }

  // Tout ce qu'il faut apporter, par élève : pratique pour préparer la salle.
  function afficherMateriel() {
    const lignes = [];
    for (const g of donnees.groupes) for (const l of g.lignes) if (l.materiel) lignes.push([g, l]);
    if (!lignes.length) {
      const vide = el("div", "vide");
      vide.appendChild(el("p", "", "Personne n’a encore indiqué de matériel."));
      elListe.replaceChildren(vide);
      return;
    }
    const carte = el("article", "carte");
    carte.appendChild(el("p", "kicker", "À apporter"));
    const ul = el("ul", "materiel");
    for (const [g, l] of lignes) {
      const li = el("li", l.personne === moi ? "moi" : "");
      li.append(el("b", "", l.nom), el("span", "", l.materiel), el("small", "", decrire(g, l)));
      ul.appendChild(li);
    }
    carte.appendChild(ul);
    elListe.replaceChildren(carte);
  }

  charger();
  // De retour dans l'appli (ex. depuis les coulisses) : on relit, le Sheet a pu changer.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) charger(); });
})();
