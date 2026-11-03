const CONFIG = {
  // Catalogue : "test.csv" = données de démonstration. Ensuite, au choix :
  //  - le lien de ton Apps Script (méthode GET) ;
  //  - "textes.csv" (+ dossier pdf/) pour tester tes propres textes en local ;
  //  - le lien d'un Google Sheet « publié sur le web » au format CSV (Fichier > Partager > Publier sur le web).
  LIEN_CSV: "https://script.google.com/macros/s/AKfycbxNFDALCAuvHkj4e5MM4B8zzcIwrQDLDJIf9_mCMg63lIzHsKxpCF_l3sJdW3O6dCYV/exec",

  // Lien du Apps Script (méthode POST) pour recevoir les propositions depuis le site.
  LIEN_ENVOI: "https://script.google.com/macros/s/AKfycbxNFDALCAuvHkj4e5MM4B8zzcIwrQDLDJIf9_mCMg63lIzHsKxpCF_l3sJdW3O6dCYV/exec",
  // Repli sans Apps Script : lien d'un Google Form. Utilisé seulement si LIEN_ENVOI est vide.
  // Les deux vides = bouton « Proposer » masqué.
  LIEN_FORMULAIRE: "",

  FORMATS: ["Pièce de théâtre", "Film", "Série", "Autre"],
  ECHEANCES: ["Échéance 1", "Échéance 2", "Échéance 3", "Échéance 4"],
  TYPES: ["Monologue", "Duo", "Scène collective"],
  SIECLES: ["XVIe", "XVIIe", "XVIIIe", "XIXe", "XXe", "XXIe"],
  REGISTRES: ["Comique", "Dramatique", "Autre"],

  // Nom de chaque champ -> titre exact de la colonne dans le Sheet (accents et majuscules ignorés)
  COLONNES: {
    format: "Format",
    titre: "Titre",
    auteur: "Auteur",
    personnages: "Personnages",
    echeance: "Échéance",
    type: "Type",
    siecle: "Siècle",
    registre: "Registre",
    duree: "Durée",
    lien: "Lien du texte",
    prenom: "Prénom",
    valide: "Validé"
  }
};
