import { Kafka, logLevel, type Producer } from 'kafkajs';

import type { Config } from '../config.js';

export function createKafka(config: Config): Kafka {
  return new Kafka({
    clientId: `order-platform-${config.ROLE}`,
    brokers: config.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
    logLevel: logLevel.ERROR,
    retry: { retries: 8, initialRetryTime: 300, maxRetryTime: 10_000 },
  });
}

export async function connectProducer(config: Config): Promise<Producer> {
  const producer = createKafka(config).producer({ allowAutoTopicCreation: true });
  await producer.connect();
  return producer;
}
