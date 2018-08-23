
# Follow the Leader!

The zero-conf leader election library using Bonjour for service discovery.

[![CircleCI](https://circleci.com/gh/remie/followtheleader.svg?style=svg)](https://circleci.com/gh/remie/followtheleader)

## Installation

```
npm install followtheleader -S
```

## Usage

```typescript
import { elect, Elector } from 'followtheleader';

console.log('Starting leader election');
const elector: Elector = elect("MyServiceName");
elector.on('leader', () => {
  console.log('This node was elected as leader');
});
elector.on('follower', () => {
  console.log('this node was elected as follower');
});
elector.on('reelection', () => {
  console.log('master node is unavailable, restarting election process');
});
elector.on('error', (error) => {
  console.log(error);
});
elector.start();
```

## API

### Initializing

```typescript
// ES6
import { elect, Elector } from 'followtheleader';
const elector = elect(options));

// CommonJS
const ftl = require('followtheleader');
const elector = ftl.elect(options);
```

options are:

- `name` (string, required)
- `type` (string, optional) - defaults to 'udp'
- `port` (number, optional) - defaults to 9001
- `host` (string, optional) - defaults to '0.0.0.0'
- `maxFailedResponses` (number, optional) - defaults to 3

The option values can either by provided as arguments or as an object.

### Starting election process

#### `elector.start()`

Starts the election process. 
If the node is elected leader it will start a heartbeat monitor that binds an UDP listener to the specified `port` and `host`. 
If the node is elected follower, it will ping the master node. If `maxFailedResponses` is reached, the node will restart the election process.

#### `Event: leader`

The node has been elected leader.

#### `Event: follower`

The node has been elected follower.

#### `Event: reelection`

The master node has become unavailable and the election process is restarted.

#### `Event: error`

An error occurred somewhere during the election proces or in the heartbeat monitor.

## Caveats

Zero-conf / Bonjour / mDNS service discovery will only work for nodes that are on the same network subnet mask. If your nodes run on servers spreading multiple geographical locations, on different networks or if you are using a diffferent VLAN per server, you should look for other solutions. A good alternative would be [Elector](https://www.npmjs.com/package/elector) which uses ZooKeeper.

If you are running your application in Amazon Web Services ECS clusters, you might want to try configuring your tasks with the `awsvpc` network mode. This will give each task their own elastic IP within the selected VPC subnet. This will only work if all ECS nodes are running in the same Availability Zone and subnet. If your cluster is running nodes in multiple Availability Zones, Zero-config/Bonjour/mDNS will not work.

If you're running Kubernetes, you should look into the [Kubernetes/Contrib election solution](https://github.com/kubernetes/contrib/tree/master/election).

## License

MIT
