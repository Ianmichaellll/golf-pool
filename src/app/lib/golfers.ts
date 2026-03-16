// Masters 2026 field — golfers sorted by approximate odds to win
// Odds are for auto-ranking in pick queues and sorting the available list
// ESPN IDs for headshot images

export type Golfer = {
  name: string;
  odds: string;    // e.g. "+800"
  country: string;
  rank: number;    // world ranking approx
  espnId: number;  // ESPN player ID for headshot
};

// Headshot URL helper
export function getHeadshotUrl(espnId: number, size: number = 80): string {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/${espnId}.png&w=${size}&h=${Math.round(size * 0.73)}`;
}

export const MASTERS_2026_FIELD: Golfer[] = [
  { name: "Scottie Scheffler", odds: "+450", country: "USA", rank: 1, espnId: 9478 },
  { name: "Rory McIlroy", odds: "+900", country: "NIR", rank: 2, espnId: 3470 },
  { name: "Xander Schauffele", odds: "+1000", country: "USA", rank: 3, espnId: 9922 },
  { name: "Jon Rahm", odds: "+1200", country: "ESP", rank: 4, espnId: 9780 },
  { name: "Collin Morikawa", odds: "+1400", country: "USA", rank: 5, espnId: 11098 },
  { name: "Ludvig Åberg", odds: "+1400", country: "SWE", rank: 6, espnId: 12028 },
  { name: "Bryson DeChambeau", odds: "+1600", country: "USA", rank: 7, espnId: 10046 },
  { name: "Brooks Koepka", odds: "+2000", country: "USA", rank: 8, espnId: 6798 },
  { name: "Patrick Cantlay", odds: "+2000", country: "USA", rank: 9, espnId: 6894 },
  { name: "Viktor Hovland", odds: "+2200", country: "NOR", rank: 10, espnId: 11150 },
  { name: "Tommy Fleetwood", odds: "+2500", country: "ENG", rank: 11, espnId: 5765 },
  { name: "Shane Lowry", odds: "+2500", country: "IRL", rank: 12, espnId: 5638 },
  { name: "Hideki Matsuyama", odds: "+2500", country: "JPN", rank: 13, espnId: 5860 },
  { name: "Justin Thomas", odds: "+2800", country: "USA", rank: 14, espnId: 9127 },
  { name: "Wyndham Clark", odds: "+3000", country: "USA", rank: 15, espnId: 10404 },
  { name: "Sungjae Im", odds: "+3000", country: "KOR", rank: 16, espnId: 10922 },
  { name: "Cameron Smith", odds: "+3000", country: "AUS", rank: 17, espnId: 9131 },
  { name: "Tony Finau", odds: "+3500", country: "USA", rank: 18, espnId: 9105 },
  { name: "Sam Burns", odds: "+3500", country: "USA", rank: 19, espnId: 10423 },
  { name: "Russell Henley", odds: "+3500", country: "USA", rank: 20, espnId: 5409 },
  { name: "Sahith Theegala", odds: "+3500", country: "USA", rank: 21, espnId: 11352 },
  { name: "Min Woo Lee", odds: "+4000", country: "AUS", rank: 22, espnId: 11287 },
  { name: "Robert MacIntyre", odds: "+4000", country: "SCO", rank: 23, espnId: 11243 },
  { name: "Cameron Young", odds: "+4000", country: "USA", rank: 24, espnId: 11253 },
  { name: "Tom Kim", odds: "+4000", country: "KOR", rank: 25, espnId: 11885 },
  { name: "Matt Fitzpatrick", odds: "+4500", country: "ENG", rank: 26, espnId: 9037 },
  { name: "Keegan Bradley", odds: "+4500", country: "USA", rank: 27, espnId: 4686 },
  { name: "Corey Conners", odds: "+5000", country: "CAN", rank: 28, espnId: 9272 },
  { name: "Jason Day", odds: "+5000", country: "AUS", rank: 29, espnId: 1680 },
  { name: "Tyrrell Hatton", odds: "+5000", country: "ENG", rank: 30, espnId: 5835 },
  { name: "Adam Scott", odds: "+5000", country: "AUS", rank: 31, espnId: 488 },
  { name: "Dustin Johnson", odds: "+5000", country: "USA", rank: 32, espnId: 3448 },
  { name: "Jordan Spieth", odds: "+5000", country: "USA", rank: 33, espnId: 5467 },
  { name: "Will Zalatoris", odds: "+5500", country: "USA", rank: 34, espnId: 11236 },
  { name: "Sepp Straka", odds: "+5500", country: "AUT", rank: 35, espnId: 9959 },
  { name: "Joaquin Niemann", odds: "+6000", country: "CHI", rank: 36, espnId: 10955 },
  { name: "Brian Harman", odds: "+6000", country: "USA", rank: 37, espnId: 5409 },
  { name: "Phil Mickelson", odds: "+6500", country: "USA", rank: 38, espnId: 308 },
  { name: "Tiger Woods", odds: "+6500", country: "USA", rank: 39, espnId: 462 },
  { name: "Max Homa", odds: "+6500", country: "USA", rank: 40, espnId: 9114 },
  { name: "Davis Thompson", odds: "+7000", country: "USA", rank: 41, espnId: 11389 },
  { name: "Akshay Bhatia", odds: "+7000", country: "USA", rank: 42, espnId: 11390 },
  { name: "Taylor Pendrith", odds: "+7500", country: "CAN", rank: 43, espnId: 10591 },
  { name: "Nick Dunlap", odds: "+7500", country: "USA", rank: 44, espnId: 12337 },
  { name: "Chris Kirk", odds: "+8000", country: "USA", rank: 45, espnId: 4602 },
  { name: "Denny McCarthy", odds: "+8000", country: "USA", rank: 46, espnId: 10247 },
  { name: "Byeong Hun An", odds: "+8000", country: "KOR", rank: 47, espnId: 6310 },
  { name: "Si Woo Kim", odds: "+8500", country: "KOR", rank: 48, espnId: 9530 },
  { name: "Billy Horschel", odds: "+9000", country: "USA", rank: 49, espnId: 4375 },
  { name: "Lucas Glover", odds: "+9000", country: "USA", rank: 50, espnId: 1040 },
  { name: "Patrick Reed", odds: "+10000", country: "USA", rank: 51, espnId: 5579 },
  { name: "Bubba Watson", odds: "+10000", country: "USA", rank: 52, espnId: 780 },
  { name: "Sergio Garcia", odds: "+10000", country: "ESP", rank: 53, espnId: 301 },
  { name: "Zach Johnson", odds: "+15000", country: "USA", rank: 54, espnId: 888 },
  { name: "Danny Willett", odds: "+15000", country: "ENG", rank: 55, espnId: 4337 },
  { name: "Charl Schwartzel", odds: "+15000", country: "RSA", rank: 56, espnId: 3216 },
  { name: "Fred Couples", odds: "+50000", country: "USA", rank: 57, espnId: 89 },
  { name: "José María Olazábal", odds: "+50000", country: "ESP", rank: 58, espnId: 270 },
  { name: "Vijay Singh", odds: "+100000", country: "FIJ", rank: 59, espnId: 377 },
  { name: "Larry Mize", odds: "+100000", country: "USA", rank: 60, espnId: 239 },
];

// Parse odds string to numeric value for sorting (lower = better)
export function oddsToNumber(odds: string): number {
  return parseInt(odds.replace("+", ""), 10);
}
