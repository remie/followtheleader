
import * as EventEmitter from 'events';
import * as Bonjour from 'bonjour';
import * as dgram from 'dgram';
const bonjour = Bonjour();

const heartbeatRequest: string = 'PING';
const heartbeatResponse: string = 'PONG';

export class BonjourElector extends EventEmitter {

  private name: string;
  private type: string;
  private port: number;
  private host: string;
  private maxFailedResponses: number = 3;

  private leader: any;
  private numOfFailedResponses: number = 0;

  constructor(options: BonjourElectorOptions) {
    super();
    this.name = options.name;
    this.type = options.type || 'ftl';
    this.port = options.port || 9001;
    this.host = options.host || '0.0.0.0';
    this.maxFailedResponses = options.maxFailedResponses || 3;
  }

  public start() {
    this.elect().catch((error) => this.emit('error', error));
  }

  private async elect(): Promise<void> {
    try {
      const leader = await this.detect();
      if (leader) {
        this.lead();
      } else {
        this.follow();
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private async detect(): Promise<boolean> {
    let leader: boolean = true;
    const watcher = bonjour.findOne({ type: this.type }, (service) => {
      if (service.name === this.name) {
        this.leader = service;
        leader = false;
      }
    });

    watcher.start();

    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        watcher.stop();
        resolve(leader);
      }, Math.floor(Math.random() * 25000) + 5000);
    });
  }

  private lead() {
    try {
      // Publish election over bonjour
      const service = bonjour.publish({ name: this.name, type: this.type, port: this.port, protocol: 'udp' });

      // Listen for heartbeat requests from followers
      const monitor = dgram.createSocket('udp4');
      monitor.on('message', (message, remote) => {
        monitor.send(heartbeatResponse, 0, heartbeatResponse.length, remote.port, remote.address);
      });
      monitor.bind(this.port, this.host);
    } catch (error) {
      this.emit('error', new Error('Failed to register this instance as leader, restarting election proces'));
      this.emit('reelection');
      this.elect();
      return;
    }

    // Tell the consumer that we are a leader;
    this.emit('leader');
  }

  private follow() {
    // Heartbeat Ping of the leader to see if re-election is required
    const interval = setInterval(() => {
      try {
        if (this.numOfFailedResponses >= this.maxFailedResponses) {
          clearInterval(interval);
          this.emit('reelection');
          this.elect();
        }

        const client = dgram.createSocket('udp4');
        client.on('error', (err) => { this.emit('error', err); });
        client.on('message', (message, remote) => {
          if (message.toString() === heartbeatResponse) {
            this.numOfFailedResponses--;
          }
          client.close();
        });

        this.numOfFailedResponses++;
        client.send(heartbeatRequest, 0, heartbeatRequest.length, this.leader.port, this.leader.addresses[0], (err, bytes) => {
          if (err) this.emit('error', err);
        });
      } catch (error) {
        this.numOfFailedResponses++;
      }
    }, 5000);

    // Tell the consumer that we are a follower;
    this.emit('follower');
  }

}

export interface BonjourElectorOptions {
  name: string;
  type?: string;
  port?: number;
  host?: string;
  maxFailedResponses?: number;
}
