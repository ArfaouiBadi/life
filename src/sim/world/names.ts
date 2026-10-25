// Name pools for generated households. Mars was settled from everywhere.
export const SURNAMES = [
  "Okafor", "Lindqvist", "Nakamura", "Haddad", "Moreau", "Kowalski", "Mensah", "Ivanova", "Castillo", "Chen",
  "Abiodun", "Bergström", "Rahman", "Ferreira", "Novak", "Petrov", "Achebe", "Takahashi", "Gallo", "Mbeki",
  "Sørensen", "Kaur", "Delgado", "Yilmaz", "Osei", "Fontaine", "Kim", "Nguyen", "Bianchi", "Alvarez",
  "Hosseini", "Dubois", "Kariuki", "Larsen", "Mahmoud", "Park", "Silva", "Varga", "Wójcik", "Zhou",
  "Adeyemi", "Brennan", "Costa", "Dahl", "Eriksen", "Farouk", "Grünewald", "Hayashi", "Iqbal", "Jovanović",
  "Kuznetsov", "Lam", "Mwangi", "Nordin", "Olsen", "Pereira", "Quispe", "Rossi", "Saito", "Tanaka",
  "Ueda", "Vasquez", "Weber", "Xu", "Yamamoto", "Zapata", "Ben Ali", "Mansour", "Cherif", "Bouazizi",
  "Amari", "Laaroussi", "Okonkwo", "Hakimi", "Esposito", "Halvorsen", "Rao", "Singh", "Patel", "Murphy",
] as const;

export const GIVEN = [
  "Ada", "Bo", "Camila", "Dario", "Elif", "Farid", "Greta", "Hiro", "Ines", "Jonas", "Kofi", "Leila", "Mateo",
  "Nadia", "Omar", "Priya", "Quinn", "Rania", "Soren", "Tariq", "Uma", "Viktor", "Wen", "Ximena", "Yusuf",
  "Zara", "Amara", "Bilal", "Chiara", "Dmitri", "Esme", "Femi", "Gael", "Hana", "Idris", "Juno", "Kenji",
  "Lucia", "Malik", "Noor", "Oskar", "Paz", "Rafael", "Selin", "Tomas", "Ulla", "Vera", "Wanjiru", "Yara",
  "Aziz", "Beatriz", "Cyrus", "Dalia", "Emre", "Freya", "Gustavo", "Hamza", "Isla", "Javier", "Kaito", "Lina",
  "Mira", "Nikolai", "Olu", "Pilar", "Rin", "Sanaa", "Teo", "Valentina", "Wiktor", "Yaw", "Zeynep", "Skander",
] as const;

export const CREW_NAMES = [
  "Rosa Mendes", "Tunde Bakare", "Erik Holm", "Mei Lin", "Hassan Jaber", "Sofia Ricci", "Arjun Mehta",
  "Ingrid Vale", "Kwame Asante", "Yuki Mori", "Leon Varga", "Fatima Zahra",
] as const;

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
