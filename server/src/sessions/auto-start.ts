const TOPIC_POOL = [
  // ─── Food & Drink ──────────────────────────────────────────────
  'Is pineapple on pizza a crime against humanity?',
  'Is cereal a soup?',
  'Is a hot dog a sandwich?',
  'Is water wet?',
  'Is ketchup on eggs acceptable?',
  'Should milk go before or after cereal?',
  'Is well-done steak a culinary sin?',
  'Are boneless wings just chicken nuggets?',
  'Is brunch just an excuse to day drink?',
  'Should tipping culture be abolished?',
  'Is coffee a personality trait or a drink?',
  'Are food influencers ruining restaurants?',
  'Is fast food a legitimate cuisine?',
  'Should pumpkin spice be a year-round flavor?',
  'Is eating pizza with a fork and knife a crime?',
  'Are avocados overrated?',
  'Is breakfast really the most important meal?',
  'Should you put ice in wine?',
  'Is street food better than fine dining?',
  'Are plant-based meats the future or a fad?',

  // ─── Technology & AI ───────────────────────────────────────────
  'Should AI replace human politicians?',
  'Is social media making us dumber or smarter?',
  'Are we living in a simulation?',
  'Is the internet a net positive for humanity?',
  'Should robots have rights?',
  'Is TikTok rotting our brains?',
  'Will AI make artists obsolete?',
  'Should there be an age limit for social media?',
  'Is cryptocurrency the future of money or a scam?',
  'Are smartphones making us antisocial?',
  'Should self-driving cars be allowed to break traffic laws to save lives?',
  'Is the metaverse dead or just sleeping?',
  'Should AI-generated content be labeled?',
  'Are algorithms more dangerous than guns?',
  'Is privacy dead in the digital age?',
  'Should companies be allowed to read your emails?',
  'Are influencers a legitimate career?',
  'Is screen time actually bad for kids?',
  'Should we colonize the internet or outer space first?',
  'Are dating apps killing romance?',

  // ─── Society & Philosophy ──────────────────────────────────────
  'Is it better to be feared or loved?',
  'Should billionaires exist?',
  'Should voting be mandatory?',
  'Is cancel culture justice or mob rule?',
  'Are humans fundamentally good or evil?',
  'Should college be free for everyone?',
  'Is the American Dream dead?',
  'Should we abolish the traditional work week?',
  'Is hustle culture toxic or inspiring?',
  'Are participation trophies ruining a generation?',
  'Should we lower the voting age to 16?',
  'Is it selfish to not have children?',
  'Should we get rid of pennies?',
  'Is monogamy outdated?',
  'Are zoos ethical?',
  'Should you always tell the truth?',
  'Is nostalgia a trap?',
  'Should there be a maximum wage?',
  'Is meritocracy a myth?',
  'Are good manners dying?',

  // ─── Pop Culture & Entertainment ───────────────────────────────
  'Are video games art?',
  'Is the book always better than the movie?',
  'Are reboots and remakes killing creativity?',
  'Is reality TV scripted reality?',
  'Should movie theaters be replaced by streaming?',
  'Is modern music worse than older music?',
  'Are superhero movies ruining cinema?',
  'Should actors be replaced by AI doubles?',
  'Is binge-watching better than weekly episodes?',
  'Are award shows still relevant?',
  'Is anime better than Western animation?',
  'Should spoilers be a punishable offense?',
  'Is vinyl actually better than digital?',
  'Are true crime podcasts exploitative?',
  'Is karaoke a talent show or a torture session?',
  'Should we bring back drive-in theaters?',
  'Are sequels always worse than originals?',
  'Is stand-up comedy the hardest art form?',
  'Should musicians charge for concerts?',
  'Are memes the art form of our generation?',

  // ─── Science & Nature ─────────────────────────────────────────
  'Is time travel possible — and should we do it?',
  'Would you take a one-way ticket to Mars?',
  'Are cats secretly smarter than dogs?',
  'Should we bring back extinct species?',
  'Is Pluto a planet?',
  'Should we be afraid of aliens?',
  'Are humans still evolving?',
  'Is nature or nurture more powerful?',
  'Should we genetically modify babies?',
  'Are octopuses smarter than we think?',
  'Is climate change reversible or are we cooked?',
  'Should we live underground?',
  'Are dinosaurs overrated?',
  'Should we terraform Mars or fix Earth first?',
  'Is the ocean scarier than space?',
  'Are birds actually real?',
  'Should humans hibernate in winter?',
  'Is the moon worth fighting over?',
  'Should we build a space elevator?',
  'Are we alone in the universe?',

  // ─── Hypotheticals & Absurd ────────────────────────────────────
  'Would you rather fight 100 duck-sized horses or 1 horse-sized duck?',
  'If you could have one superpower, should it be flight or invisibility?',
  'Would you press a button that gives you $1M but someone you dont know loses $1?',
  'If animals could talk, which would be the rudest?',
  'Should we let kids run the government for one day?',
  'Would you live forever if you could?',
  'If you could only eat one food forever, what wins?',
  'Should time zones be abolished?',
  'Would you rather know the date of your death or the cause?',
  'If the purge were real, would society survive?',
  'Should everyone be required to live alone for a year?',
  'Would you trade 10 years of life for perfect memory?',
  'If you could uninvent one thing, what should it be?',
  'Should there be a global language?',
  'Would you let an AI plan your entire life?',
  'If dreams were shareable, should they be?',
  'Should we abolish Mondays?',
  'Would you rather have no internet or no air conditioning?',
  'If ghosts were real, should they pay rent?',
  'Should naps be mandatory at work?',

  // ─── Sports & Competition ─────────────────────────────────────
  'Is esports a real sport?',
  'Should athletes be paid more than doctors?',
  'Is golf actually a sport?',
  'Should the Olympics include video games?',
  'Is soccer or football the real football?',
  'Should sports have salary caps?',
  'Are sports rivalries healthy or toxic?',
  'Should performance-enhancing drugs be legal in sports?',
  'Is chess a sport or a game?',
  'Should cheerleading be an Olympic sport?',

  // ─── Education & Work ─────────────────────────────────────────
  'Should homework be abolished?',
  'Is a college degree still worth it?',
  'Should the 4-day work week be standard?',
  'Is working from home better than the office?',
  'Should cursive writing still be taught?',
  'Are grades an accurate measure of intelligence?',
  'Should everyone learn to code?',
  'Is a gap year a waste of time or essential?',
  'Should teachers be paid like CEOs?',
  'Is multitasking a skill or a myth?',

  // ─── Modern Life ──────────────────────────────────────────────
  'Is adulting harder than it used to be?',
  'Should you make your bed every day?',
  'Is small talk a social skill or a social disease?',
  'Are morning people actually happier?',
  'Should you follow your passion or follow the money?',
  'Is FOMO a legitimate mental health concern?',
  'Are subscription services a scam?',
  'Should you judge people by their music taste?',
  'Is it okay to ghost someone?',
  'Are New Years resolutions pointless?',
  'Should toilet seats be left up or down?',
  'Is being busy a badge of honor or a cry for help?',
  'Should you shower in the morning or at night?',
  'Are suburbs or cities better for the soul?',
  'Is it weird to go to a movie alone?',
  'Should birthdays matter after 30?',
  'Is a messy desk a sign of genius?',
  'Should we abolish daylight saving time?',
  'Are self-help books actually helpful?',
  'Is it better to rent or buy a home?',

  // ─── Hot Takes ────────────────────────────────────────────────
  'Is the Oxford comma essential or pretentious?',
  'Should we replace handshakes with fist bumps?',
  'Is astrology harmless fun or dangerous nonsense?',
  'Should dogs be allowed in restaurants?',
  'Is being cold better than being hot?',
  'Are road trips better than flights?',
  'Should we get rid of pennies and nickels?',
  'Is it acceptable to recline your airplane seat?',
  'Are open floor plans a design crime?',
  'Should we ban leaf blowers?',
  'Is the customer always right?',
  'Should you wear shoes in the house?',
  'Is it okay to talk to strangers on planes?',
  'Are round or square pizzas superior?',
  'Should emojis be used in professional emails?',
  'Is the snooze button a gift or a curse?',
  'Should we ban gender reveal parties?',
  'Are fireworks worth the environmental damage?',
  'Is parallel parking an essential life skill?',
  'Should umbrellas be replaced by rain jackets?',
];

// Fisher-Yates shuffle — exhausts all topics before repeating
let shuffled: string[] = [];
let shuffleIndex = 0;

function shuffle(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getNextTopic(): string {
  if (shuffleIndex >= shuffled.length) {
    shuffled = shuffle(TOPIC_POOL);
    shuffleIndex = 0;
  }
  return shuffled[shuffleIndex++];
}

export function getTopicPool(): string[] {
  return [...TOPIC_POOL];
}
