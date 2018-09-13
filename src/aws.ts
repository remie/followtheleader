
import * as fs from 'fs';
import * as EventEmitter from 'events';
import { ECS } from 'aws-sdk';

export class AWSElector extends EventEmitter {

  private ecs: ECS;
  private filter: ECS.ListTasksRequest;
  private metadata: any;

  private leader: any;
  private peers: string[];
  private numOfFailedResponses: number = 0;

  constructor(clientConfiguration: ECS.ClientConfiguration, filter: ECS.ListTasksRequest) {
    super();
    this.ecs = new ECS(clientConfiguration);
    this.filter = filter;
  }

  public start() {
    this.elect().catch((error) => this.emit('error', error));
  }

  private async elect(): Promise<void> {
    try {
      const leader = await this.detect();
      if (leader) {
        this.emit('leader');
      } else {
        this.follow();
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private async detect(): Promise<boolean> {
    try {
      // Make sure to wait for metadata to be available
      await this.readMetadata();
      if (!this.metadata) {
        throw new Error('AWSElector requires conatiner metadata to be enabled and available. Please see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-metadata.html#enable-metadata');
      }

      // We are going for the full monty, pagination is not supported
      this.filter.maxResults = 100;
      const listTasksResponse: ECS.ListTasksResponse = await this.ecs.listTasks(this.filter).promise();
      this.peers = listTasksResponse.taskArns || [];

      // Sort the list of peers to always get the same leader as a result
      this.peers.sort();
      return (this.peers[0] === this.metadata.TaskARN);
    } catch (error) {
      if (error.code === 'ThrottlingException') {
        console.log('API rate limit exceeded, restarting election process in 2 minutes');
        await new Promise((resolve) => setTimeout(() => resolve(), 2 * 60 * 1000));
        return await this.detect();
      } else {
        console.log('An error occurred while trying to detect elected leadership, restarting election process in 5 minutes', error);
        await new Promise((resolve) => setTimeout(() => resolve(), 5 * 60 * 1000));
        return await this.detect();
      }
    }
  }

  private follow() {
    // Tell the consumer that we are a follower;
    this.emit('follower');

    // Check for changes in elected leadership every 2 minutes
    const interval = setInterval(async () => {
      const isCurrentLeader = await this.detect();
      if (!this.leader && isCurrentLeader || this.leader && !isCurrentLeader) {
        clearInterval(interval);
        this.emit('reelection');
        this.elect();
      }
    }, 2 * 60 * 1000);
  }

  private async readMetadata(): Promise<void> {
    let count = 0;
    while (!this.metadata && count <= 10) {
      if (process.env.ECS_CONTAINER_METADATA_FILE && fs.existsSync(process.env.ECS_CONTAINER_METADATA_FILE)) {
        try {
          this.metadata = require(process.env.ECS_CONTAINER_METADATA_FILE);
        } catch (error) {
          // Discard this error, as the while-loop will deal with this
        }
      } else {
        await new Promise((resolve) => setTimeout(() => resolve(), 500));
      }
      count++;
    }
  }

}
