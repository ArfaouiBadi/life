// Name pools for generated households: Tunisian family and first names.
// Keep each list's length and keep entries unique: names are drawn by index from the seeded RNG,
// so same-length lists leave the world (homes, people, layout) exactly as it is for a given seed.
export const SURNAMES = [
  "Hammami", "Gharbi", "Jaziri", "Mejri", "Dridi", "Sassi", "Bouslama", "Ayari", "Khelifi", "Mansouri",
  "Zouari", "Ben Youssef", "Ben Ammar", "Ben Salem", "Ben Romdhane", "Ben Hassine", "Ben Mabrouk", "Belhadj", "Chaabane", "Chaouch",
  "Dhaouadi", "Ferchichi", "Hamdi", "Hannachi", "Jlassi", "Jouini", "Kammoun", "Khemiri", "Labidi", "Lahmar",
  "Maalej", "Masmoudi", "Mathlouthi", "Mekki", "Messaoudi", "Missaoui", "Mzoughi", "Nasri", "Oueslati", "Rekik",
  "Riahi", "Rouissi", "Saidi", "Sahli", "Selmi", "Slama", "Smaoui", "Souissi", "Tlili", "Triki",
  "Zarrouk", "Zaouali", "Zghal", "Zitouni", "Abidi", "Baccouche", "Bahri", "Ben Abdallah", "Ben Amor", "Ben Ayed",
  "Ben Brahim", "Ben Fredj", "Ben Hamida", "Ben Khalifa", "Ben Othman", "Ghorbel", "Boukhris", "Chakroun", "Charfi", "Dahmani",
  "Ellouze", "Fourati", "Frikha", "Gargouri", "Guesmi", "Hamrouni", "Kallel", "Karray", "Mahjoub", "Mezghani",
] as const;

export const GIVEN = [
  "Yasmine", "Mohamed", "Mariem", "Ahmed", "Sarra", "Ali", "Rania", "Omar", "Ines", "Hamza", "Asma", "Amine", "Hiba",
  "Aymen", "Rim", "Bilel", "Emna", "Skander", "Salma", "Mehdi", "Imen", "Walid", "Olfa", "Hedi",
  "Sonia", "Hichem", "Fatma", "Slim", "Khadija", "Anis", "Leila", "Fares", "Malek", "Ghassen", "Nesrine", "Haythem",
  "Wiem", "Hatem", "Chaima", "Iyed", "Eya", "Khalil", "Farah", "Marwen", "Safa", "Nizar", "Sirine", "Oussema",
  "Hana", "Rami", "Dorra", "Riadh", "Yosra", "Seif", "Amel", "Tarek", "Hajer", "Wassim", "Houda", "Yassine",
  "Samia", "Zied", "Zeineb", "Adam", "Mouna", "Elyes", "Rahma", "Firas", "Ahlem", "Moez", "Arij", "Taha", "Molka",
] as const;

export const CREW_NAMES = [
  "Rafik Ksontini", "Sonia Nouira", "Bilel Rebai", "Hajer Sellami", "Mourad Siala", "Ines Sghaier", "Tarek Turki",
  "Wiem Werghi", "Hatem Yahyaoui", "Olfa Zribi", "Seif Fakhfakh", "Emna Bouzid",
] as const;

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
