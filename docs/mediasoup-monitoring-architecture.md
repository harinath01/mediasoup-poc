# Human Proctoring Architecture Overview

## 1. Requirement

In a human proctoring setup, multiple students participate in an online session while one or more staff members monitor them remotely. The goal is not to create a meeting experience where every participant interacts with every other participant. The goal is to allow proctors to observe students in near real time and take action when they notice suspicious activity, policy violations, or other anomalies.

Because of that, the media flow is different from a standard conferencing product:

- many students broadcast their media
- one or more staff members monitor those student streams
- staff do not need to watch every student at the same time
- staff should be able to selectively open and switch between student feeds
- latency should remain low enough for effective monitoring

This requirement creates a selective many-to-one media pattern. That pattern is the main reason the system architecture cannot be treated like a normal group video call.

## 2. Technology Choice

Now that the requirement is clear, the next step is to explain the technology choice.

For this kind of human proctoring system, we need a media transport mechanism that is low-latency and suitable for live camera, microphone, and optional screen sharing. We also need a server-side media architecture that lets proctors watch only selected student streams instead of subscribing every participant to every other participant.

Because of that, this architecture uses:

- `WebRTC` for real-time media transport
- an `SFU` model for selective forwarding
- `mediasoup` as the SFU library

Before looking at mediasoup itself, it helps to understand the WebRTC foundation that mediasoup builds on.

## 3. WebRTC Background

`WebRTC` is the browser and real-time transport foundation used for live audio, video, and screen-sharing communication.

It is a strong fit for human proctoring because it provides:

- low-latency media delivery
- browser support for camera, microphone, and display capture
- secure media transport
- network adaptation for real-time sessions

This is important because a proctoring system loses value if the stream is delayed too much. Staff need to observe what students are doing with as little delay as possible.

It is also important to understand that WebRTC is not one single protocol. It is a collection of standards and browser APIs used together for real-time communication.

Some of the key parts are:

- `ICE` for finding a working network path
- `STUN` for discovering public-facing address information
- `TURN` for relaying traffic when direct connectivity is not possible
- `DTLS` for secure key negotiation
- `SRTP` for encrypted media transport
- `RTP` for carrying real-time media packets

In a simple peer-to-peer WebRTC setup, two endpoints usually exchange connection information through signaling, establish connectivity, and then send media directly to each other.

That is enough to understand why WebRTC is useful here. The next question is why plain peer-to-peer WebRTC is not enough for this requirement.

## 4. Why an SFU Is Needed

The human proctoring requirement is not just about sending real-time media. It is also about controlling how that media is distributed.

If every participant connected directly to every other participant, the system would behave like a mesh network. That approach does not fit this use case well because:

- students do not need to watch each other
- staff do not need to subscribe to all students at once
- large rooms would create too many direct peer connections
- browser CPU, bandwidth, and session management become harder to control

An `SFU` (Selective Forwarding Unit) solves this by receiving media from senders and forwarding only the selected streams to receivers.

That makes it a good fit for proctoring because:

- each student can publish media once to the server
- staff can consume only the students they want to monitor
- the application can pause, resume, or avoid consuming streams that are not currently needed
- the server does not need to mix all streams together like an MCU

So the architecture becomes:

- students mainly act as media senders
- staff mainly act as media receivers
- the SFU sits in the middle and controls selective forwarding

Once that SFU model is clear, we can explain how mediasoup provides it.

## 5. What mediasoup Provides

`mediasoup` is a Node.js SFU library that gives the application direct control over real-time media routing.

It is the server-side component used to implement the selective forwarding behavior described above.

mediasoup is useful here because it allows the application to:

- define media routing domains
- create WebRTC transports for endpoints
- receive tracks published by students
- create consumer tracks for staff on demand
- control which streams are forwarded to which viewers

At the same time, mediasoup is only one part of the overall system.

It is important to understand that mediasoup does not provide:

- the full application
- business logic for rooms or participants
- a ready-made signaling server
- a replacement for ICE, STUN, or TURN

In other words, mediasoup handles SFU media routing, while the application still has to handle signaling and session coordination.

## 6. Core mediasoup Concepts

Before describing the signaling flow, it helps to understand the main mediasoup objects used in a system like this.

### Worker

A `Worker` is a mediasoup worker process responsible for media-related processing.

It is not just an in-process JavaScript abstraction. mediasoup runs a separate worker binary for media handling, which is why worker planning is closely tied to CPU capacity. Applications usually create one or more workers and place routers on them.

### Router

A `Router` defines a media-routing domain and the codec capabilities available within that domain.

In many applications, one router is mapped to one room. That is a common design choice for systems where a room represents one logical session.

### WebRtcTransport

A `WebRtcTransport` represents the WebRTC transport between a client and the SFU.

This is the transport object used to carry media between the browser and mediasoup.

Common patterns are:

- a send transport for publishing media
- a receive transport for consuming media

### Producer

A `Producer` is a mediasoup entity that sends a media track into the SFU.

In a proctoring system, examples include:

- student camera video
- student microphone audio
- student screen-share video

### Consumer

A `Consumer` is a mediasoup entity that receives a produced track from the SFU.

In this requirement, a staff member consumes selected student tracks through consumers created by the server.

### Device

On the client side, `mediasoup-client` provides a `Device`.

The `Device` is a helper abstraction that:

- loads router RTP capabilities
- represents what the client can send and receive
- creates send and receive transports

With these concepts in place, the signaling and media flow becomes easier to understand.

## 7. Signaling and Media Flow

mediasoup still relies on WebRTC underneath, but the application usually manages the flow in smaller, explicit steps instead of treating everything as one peer-to-peer browser session.

This means the application signaling layer becomes an important part of the design.

At a high level, the flow is as follows.

### Step 1. Join the session

A student or staff member first joins a logical room through the application server.

### Step 2. Get router capabilities

The server uses a mediasoup router for that room and shares its RTP capabilities with the client.

### Step 3. Load the client Device

The client loads those router RTP capabilities into a mediasoup-client `Device`.

This prepares the client to create compatible transports.

### Step 4. Create a transport

The server creates a `WebRtcTransport` and returns the transport details required by the client, such as:

- transport ID
- ICE parameters
- ICE candidates
- DTLS parameters

### Step 5. Connect the transport

The client creates a send or receive transport and, when the transport emits its connect event, sends DTLS parameters back to the server.

The server then calls the transport `connect` API.

At the same time, it is useful to remember that ICE and DTLS are related but not identical parts of transport establishment. ICE connectivity checks use the candidates provided earlier, while DTLS establishes secure transport parameters. In practice, those states can progress independently and may not appear as one perfectly linear sequence.

### Step 6. Produce student media

If the client is a student, it captures media and calls `produce()` on the send transport.

This creates producers for tracks such as:

- camera video
- microphone audio
- screen-share video

### Step 7. Discover available producers

If the client is a staff member, it needs to know which student producers are available to consume.

That producer information is communicated through the application's signaling layer.

### Step 8. Consume selected streams

When the staff member chooses to watch a student's feed, the application asks the server to create a `Consumer` for that producer.

If the client's RTP capabilities are compatible, the server returns the necessary consumer details and the client calls `consume()` on the receive transport.

The resulting media track is then attached to the UI for playback.

In a selective monitoring system, this step should not be treated as "subscribe every staff member to every student." The efficient model is to create consumers only for the streams that matter to the current monitoring view and then control them with operations such as `pause()` and `resume()` as attention shifts between students. That is usually more efficient than repeatedly tearing down and recreating every consumer whenever the proctor changes focus.

This flow is the key difference from a normal meeting application: media consumption is selective and driven by the monitoring use case.

## 8. How This Fits Human Proctoring

With the signaling and media flow explained, the architecture now maps directly to the original requirement.

### Student role

Students mainly publish media to the system.

Their responsibility is to provide the streams that a proctor may need to inspect, such as:

- camera feed
- microphone feed
- screen-share feed

### Staff role

Staff mainly consume media from the system.

Their responsibility is not to join a conversation with every student, but to selectively monitor students as needed.

This means staff should be able to:

- open a few student feeds at a time
- switch between students
- focus on suspicious or flagged users
- avoid subscribing to all streams continuously

In practice, that selective behavior is one of the most important parts of the design. A proctoring dashboard should keep active consumption limited to the feeds that are currently visible or relevant, and should rely on consumer control such as pause and resume as the monitoring focus changes.

### Server role

The server and SFU act as the coordination layer between those two roles.

They make it possible to:

- receive streams from many students
- expose those streams to staff
- create consumers only when needed
- keep the architecture efficient for selective monitoring

This is why `WebRTC + SFU + mediasoup` is a suitable technical choice for a human proctoring POC.

## 9. Important Notes

There are a few technical notes that are useful to keep in mind when discussing this architecture.

### mediasoup does not remove the need for TURN

mediasoup helps centralize media through the SFU, but connectivity still depends on normal WebRTC networking behavior. In restrictive networks, TURN may still be necessary.

### mediasoup does not replace WebRTC

mediasoup is built on top of the WebRTC model. It gives more explicit control over routing and media entities, but it still relies on WebRTC transport concepts.

### Secure media is not just plain RTP

In browser WebRTC, media is typically carried using `SRTP`, with secure transport parameters negotiated through `DTLS`.

### A router is not automatically the same as a room

Many systems map one router to one room, but that is an application design decision rather than a hard protocol rule.

### Scale affects worker and router planning

The requirement of monitoring hundreds of students is not satisfied by selective consumption alone. It also affects how mediasoup workers and routers are distributed.

Because a worker is a separate media process, worker count is usually aligned with available CPU resources rather than treated as an arbitrary object count. For larger deployments, routers are commonly spread across workers instead of concentrating everything into a single worker. So while selective forwarding reduces unnecessary browser subscriptions, server-side worker and router topology is still an important part of supporting large rooms reliably.

## 10. Summary

This POC is based on a human proctoring requirement, not a group meeting requirement.

That difference drives the architecture:

- many students publish
- staff selectively monitor
- low latency is important
- not every participant should receive every stream

WebRTC provides the low-latency real-time media transport needed for live monitoring. The SFU model makes selective forwarding possible. mediasoup provides the server-side primitives, such as workers, routers, transports, producers, and consumers, that allow the application to implement that monitoring pattern in a controlled way.
