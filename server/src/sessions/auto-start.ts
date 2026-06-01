const TOPIC_POOL = [
  'Is pineapple on pizza a crime against humanity?',
  'Should AI replace human politicians?',
  'Are cats secretly smarter than dogs?',
  'Is social media making us dumber or smarter?',
  'Would you rather fight 100 duck-sized horses or 1 horse-sized duck?',
  'Is it better to be feared or loved?',
  'Should homework be abolished?',
  'Are video games art?',
  'Is time travel possible — and should we do it?',
  'Would you take a one-way ticket to Mars?',
  'Is breakfast really the most important meal?',
  'Should billionaires exist?',
  'Are we living in a simulation?',
  'Is the internet a net positive for humanity?',
  'Should voting be mandatory?',
];

let topicIndex = 0;

export function getNextTopic(): string {
  const topic = TOPIC_POOL[topicIndex % TOPIC_POOL.length];
  topicIndex++;
  return topic;
}

export function getTopicPool(): string[] {
  return [...TOPIC_POOL];
}
