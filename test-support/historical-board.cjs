// Reconstruct already-saved v7 boards for compatibility tests. Not a playable starting roster.
const ROSTER = [
  ['reich', 'DEB', 'leader', 'Führer'],
  ['reich', 'Sattyaki', 'chief', 'Strumabteilung Stabschief'],
  ['reich', 'Utsab Chatterjee', 'chief', 'Schutzstaffel Stabschief'],
  ['reich', 'Soumalya Majumdar', 'chief', 'Wehrmacht Stabschief'],
  ['reich', 'Utkarsh', 'chief', 'Luftwaffe Stabschief (Air Chief)'],
  ['reich', 'Anasruta Tagore', 'diplomat', 'Diplomat'],
  ['reich', 'Ritam', 'soldier', 'Assassin'],
  ['reich', 'Kaustav', 'soldier', 'Soldier'],
  ['reich', 'Rohan', 'soldier', 'Soldier'],
  ['reich', 'Sounak', 'soldier', 'Soldier'],
  ['reich', 'Souptik Das', 'soldier', 'Soldier'],
  ['reich', 'Angel Halder', 'soldier', 'Soldier'],
  ['reich', 'Dhruv', 'soldier', 'Soldier'],
  ['dawn', 'Syamantak Kar', 'leader', 'Prophet King'],
  ['dawn', 'Anish', 'chief', 'Commander-in-Chief'],
  ['dawn', 'Rishit Mullick', 'diplomat', 'Envoy'],
  ['dawn', 'Debjiit', 'soldier', 'Soldier'],
  ['dawn', 'Swapnil Das', 'soldier', 'Soldier'],
  ['dawn', 'Subhadeep', 'soldier', 'Soldier'],
  ['dawn', 'Souvik', 'soldier', 'Soldier'],
  ['dawn', 'Ratnadeep', 'soldier', 'Soldier'],
  ['dawn', 'Titli', 'soldier', 'Soldier'],
  ['dawn', 'Suvodeep', 'soldier', 'Soldier']
];
module.exports = function historicalBoard(game, now, capitalStart = true) {
  const s = game.newGame(now, capitalStart, 7);
  for (const [team, name, role, title] of ROSTER) s.players[name] = {team, role, title, cd: 0, cp: 10};
  s.players.Dhruv.pw = '65605199d27e220189765c7160edbf0f1bab83f425328748acd3882989eab94e';
  return s;
};
