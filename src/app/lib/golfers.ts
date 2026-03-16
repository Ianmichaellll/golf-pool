// Masters 2026 field — golfers sorted by approximate odds to win
// Odds are for auto-ranking in pick queues and sorting the available list

export type Golfer = {
  name: string;
  odds: string;    // e.g. "+800"
  country: string;
  rank: number;    // world ranking approx
};

export const MASTERS_2026_FIELD: Golfer[] = [
  { name: "Scottie Scheffler", odds: "+450", country: "USA", rank: 1 },
  { name: "Rory McIlroy", odds: "+900", country: "NIR", rank: 2 },
  { name: "Xander Schauffele", odds: "+1000", country: "USA", rank: 3 },
  { name: "Jon Rahm", odds: "+1200", country: "ESP", rank: 4 },
  { name: "Collin Morikawa", odds: "+1400", country: "USA", rank: 5 },
  { name: "Ludvig Åberg", odds: "+1400", country: "SWE", rank: 6 },
  { name: "Bryson DeChambeau", odds: "+1600", country: "USA", rank: 7 },
  { name: "Brooks Koepka", odds: "+2000", country: "USA", rank: 8 },
  { name: "Patrick Cantlay", odds: "+2000", country: "USA", rank: 9 },
  { name: "Viktor Hovland", odds: "+2200", country: "NOR", rank: 10 },
  { name: "Tommy Fleetwood", odds: "+2500", country: "ENG", rank: 11 },
  { name: "Shane Lowry", odds: "+2500", country: "IRL", rank: 12 },
  { name: "Hideki Matsuyama", odds: "+2500", country: "JPN", rank: 13 },
  { name: "Justin Thomas", odds: "+2800", country: "USA", rank: 14 },
  { name: "Wyndham Clark", odds: "+3000", country: "USA", rank: 15 },
  { name: "Sungjae Im", odds: "+3000", country: "KOR", rank: 16 },
  { name: "Cameron Smith", odds: "+3000", country: "AUS", rank: 17 },
  { name: "Tony Finau", odds: "+3500", country: "USA", rank: 18 },
  { name: "Sam Burns", odds: "+3500", country: "USA", rank: 19 },
  { name: "Russell Henley", odds: "+3500", country: "USA", rank: 20 },
  { name: "Sahith Theegala", odds: "+3500", country: "USA", rank: 21 },
  { name: "Min Woo Lee", odds: "+4000", country: "AUS", rank: 22 },
  { name: "Robert MacIntyre", odds: "+4000", country: "SCO", rank: 23 },
  { name: "Cameron Young", odds: "+4000", country: "USA", rank: 24 },
  { name: "Tom Kim", odds: "+4000", country: "KOR", rank: 25 },
  { name: "Matt Fitzpatrick", odds: "+4500", country: "ENG", rank: 26 },
  { name: "Keegan Bradley", odds: "+4500", country: "USA", rank: 27 },
  { name: "Corey Conners", odds: "+5000", country: "CAN", rank: 28 },
  { name: "Jason Day", odds: "+5000", country: "AUS", rank: 29 },
  { name: "Tyrrell Hatton", odds: "+5000", country: "ENG", rank: 30 },
  { name: "Adam Scott", odds: "+5000", country: "AUS", rank: 31 },
  { name: "Dustin Johnson", odds: "+5000", country: "USA", rank: 32 },
  { name: "Jordan Spieth", odds: "+5000", country: "USA", rank: 33 },
  { name: "Will Zalatoris", odds: "+5500", country: "USA", rank: 34 },
  { name: "Sepp Straka", odds: "+5500", country: "AUT", rank: 35 },
  { name: "Joaquin Niemann", odds: "+6000", country: "CHI", rank: 36 },
  { name: "Brian Harman", odds: "+6000", country: "USA", rank: 37 },
  { name: "Phil Mickelson", odds: "+6500", country: "USA", rank: 38 },
  { name: "Tiger Woods", odds: "+6500", country: "USA", rank: 39 },
  { name: "Max Homa", odds: "+6500", country: "USA", rank: 40 },
  { name: "Davis Thompson", odds: "+7000", country: "USA", rank: 41 },
  { name: "Akshay Bhatia", odds: "+7000", country: "USA", rank: 42 },
  { name: "Taylor Pendrith", odds: "+7500", country: "CAN", rank: 43 },
  { name: "Nick Dunlap", odds: "+7500", country: "USA", rank: 44 },
  { name: "Chris Kirk", odds: "+8000", country: "USA", rank: 45 },
  { name: "Denny McCarthy", odds: "+8000", country: "USA", rank: 46 },
  { name: "Byeong Hun An", odds: "+8000", country: "KOR", rank: 47 },
  { name: "Si Woo Kim", odds: "+8500", country: "KOR", rank: 48 },
  { name: "Billy Horschel", odds: "+9000", country: "USA", rank: 49 },
  { name: "Lucas Glover", odds: "+9000", country: "USA", rank: 50 },
  { name: "Patrick Reed", odds: "+10000", country: "USA", rank: 51 },
  { name: "Bubba Watson", odds: "+10000", country: "USA", rank: 52 },
  { name: "Sergio Garcia", odds: "+10000", country: "ESP", rank: 53 },
  { name: "Zach Johnson", odds: "+15000", country: "USA", rank: 54 },
  { name: "Danny Willett", odds: "+15000", country: "ENG", rank: 55 },
  { name: "Charl Schwartzel", odds: "+15000", country: "RSA", rank: 56 },
  { name: "Fred Couples", odds: "+50000", country: "USA", rank: 57 },
  { name: "José María Olazábal", odds: "+50000", country: "ESP", rank: 58 },
  { name: "Vijay Singh", odds: "+100000", country: "FIJ", rank: 59 },
  { name: "Larry Mize", odds: "+100000", country: "USA", rank: 60 },
];

// Parse odds string to numeric value for sorting (lower = better)
export function oddsToNumber(odds: string): number {
  return parseInt(odds.replace("+", ""), 10);
}
