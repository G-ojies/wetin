/**
 * Offline rights card for police stops and arrests.
 * Every `quote` is verbatim statute text; scripts/check-card.mjs fails the build if one is not found in the corpus.
 */
export type CardItem = { id: string; sectionId: string; cite: string; en: string; pcm: string; quote: string };

export const CARD_ITEMS: CardItem[] = [
  {
    id: "reason",
    sectionId: "police-act:35",
    cite: "Police Act 2020, s. 35(1)",
    en: "They must tell you why you are being arrested.",
    pcm: "Dem must tell you why dem dey arrest you.",
    quote: "shall inform the suspect immediately of the reason for the arrest",
  },
  {
    id: "silent",
    sectionId: "constitution:35",
    cite: "Constitution, s. 35(2)",
    en: "You can stay silent until you have spoken to a lawyer or someone you choose.",
    pcm: "You fit keep quiet until you don talk to lawyer or person wey you choose.",
    quote: "shall have the right to remain silent or avoid answering any question until after consultation with a legal practitioner or any other person of his own choice",
  },
  {
    id: "dignity",
    sectionId: "constitution:34",
    cite: "Constitution, s. 34(1)(a)",
    en: "Nobody may torture you, beat you, or treat you in a degrading way.",
    pcm: "Nobody get right to torture you, beat you, or disgrace you.",
    quote: "no person shall be subject to torture or to inhuman or degrading treatment",
  },
  {
    id: "search",
    sectionId: "police-act:51",
    cite: "Police Act 2020, s. 51(2)",
    en: "For any search, the officer must first ask for your cooperation. Force is a last resort.",
    pcm: "For any search, officer must first ask for your cooperation. Force na last resort.",
    quote: "The co-operation of the person to be searched shall be sought in every case",
  },
  {
    id: "privacy",
    sectionId: "constitution:37",
    cite: "Constitution, s. 37",
    en: "Your phone calls, messages and home are protected as private.",
    pcm: "Your phone call, message and house na your private matter, law protect am.",
    quote: "The privacy of citizens, their homes, correspondence, telephone conversations and telegraphic communications is hereby guaranteed and protected",
  },
  {
    id: "civil",
    sectionId: "acja:8",
    cite: "ACJA 2015, s. 8(2)",
    en: "You cannot be arrested over a debt, a contract dispute or any civil matter.",
    pcm: "Dem no fit arrest you because of debt, contract wahala or any civil matter.",
    quote: "A suspect shall not be arrested merely on a civil wrong or breach of contract",
  },
  {
    id: "lieu",
    sectionId: "police-act:36",
    cite: "Police Act 2020, s. 36",
    en: "They cannot arrest you in place of a relative or friend they are looking for.",
    pcm: "Dem no fit arrest you instead of your family or friend wey dem dey find.",
    quote: "A person shall not be arrested in place of a suspect",
  },
  {
    id: "contact",
    sectionId: "acja:14",
    cite: "ACJA 2015, s. 14(2)",
    en: "You must be allowed to get legal advice and to contact someone to arrange bail.",
    pcm: "Dem must allow you get legal advice and call person wey go arrange your bail.",
    quote: "reasonable facilities for obtaining legal advice, access to communication for taking steps to furnish bail",
  },
  {
    id: "bail",
    sectionId: "police-act:62",
    cite: "Police Act 2020, s. 62(1)",
    en: "Unless the offence carries the death penalty, the station must consider releasing you on bail.",
    pcm: "If the offence no be the one wey carry death penalty, station must consider to release you on bail.",
    quote: "shall inquire into the case and release the suspect arrested on bail",
  },
  {
    id: "court",
    sectionId: "constitution:35",
    cite: "Constitution, s. 35(5)",
    en: "You must be taken to court within one day if a court is within 40 km, otherwise within two days.",
    pcm: "Dem must carry you go court within one day if court dey within 40 km, if not, within two days.",
    quote: "within a radius of forty kilometres, a period of one day",
  },
];

export const CARD_DO = {
  en: [
    "Stay calm. Do not run, argue or resist physically.",
    "Ask the officer's name and police station.",
    "Ask clearly: \"Am I under arrest? What is the reason?\"",
    "Say: \"I will remain silent until I speak to a lawyer.\"",
    "Note the time, place, vehicle number and any witnesses.",
    "Call or message someone you trust as soon as you can.",
  ],
  pcm: [
    "Calm down. No run, no argue, no fight.",
    "Ask the officer im name and im police station.",
    "Ask am clear: \"You dey arrest me? Wetin be the reason?\"",
    "Talk say: \"I go keep quiet until I see lawyer.\"",
    "Note the time, place, motor number and anybody wey see am.",
    "Call or message person wey you trust as soon as you fit.",
  ],
};
