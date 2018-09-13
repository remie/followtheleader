
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

    if (!process.env.ECS_CONTAINER_METADATA_FILE) {
      throw new Error('AWSElector requires conatiner metadata to be enabled. Please see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-metadata.html#enable-metadata');
    }

    this.ecs = new ECS(clientConfiguration);
    this.filter = filter;
    this.metadata = require(process.env.ECS_CONTAINER_METADATA_FILE);
  }

  public start() {
    this.elect().catch((error) => this.emit('error', error));
  }

  private async elect(): Promise<void> {
    try {
      const leader = await this.detect();
      if (leader) {
        // Tell the consumer that we are a leader;
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
      // We are going for the full monty, pagination is not supported
      this.filter.maxResults = 100;
      const listTasksResponse: ECS.ListTasksResponse = await this.ecs.listTasks(this.filter).promise();
      this.peers = listTasksResponse.taskArns || [];
      this.peers.sort();
      return (this.peers[0] === this.metadata.TaskARN);
    } catch (error) {
      if (error.code === 'ThrottlingException') {
        console.log('API rate limit exceeded, restarting election process in 2 minutes');
        await new Promise((resolve) => setTimeout(() => resolve(), 2 * 60 * 1000));
        return this.detect();
      } else {
        console.log('An error occurred while trying to detect elected leadership, restarting election process');
        console.error(error);
        this.emit('reelection');
        this.elect();
      }
    }
  }

  private follow() {
    // Tell the consumer that we are a follower;
    this.emit('follower');

    const describeTasksRequest: ECS.DescribeTasksRequest = {
      tasks: this.peers || []
    };

    this.ecs.waitFor('tasksStopped', describeTasksRequest).promise().then(() => {
      console.log('A change has occurred which caused me to question the elected leadership, restarting election process');
      this.emit('reelection');
      this.elect();
    }).catch(async (error) => {
      if (error.code === 'ThrottlingException') {
        console.log('API rate limit exceeded, restarting election process in 2 minutes');
        await new Promise((resolve) => setTimeout(() => resolve(), 2 * 60 * 1000));
      } else {
        console.log('An error occurred while monitoring changes to elected leadership, restarting election process');
        console.error(error);
      }
      this.emit('reelection');
      this.elect();
    });
  }

}
