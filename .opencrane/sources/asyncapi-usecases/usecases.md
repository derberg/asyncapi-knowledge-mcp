# AsyncAPI Use Cases

All use cases related to AsyncAPI collectively contribute to most important aspect of software development, which is costs reduction. For example with "Infrastructure as Code" instead of enabling costly on-demand topic provisioning in your broker, you can automate it safely using AsyncAPI contracts. Before you provision new topics, you can first validate if it this is not causing duplicates and unnecessary costs increase. Use case like "Governance and Consistency" or "Developer Portal" significantly contributes to adoption of events infrastructure in consistent way and makes onboarding faster, that directly converts to cost reduction.

Real-world ways teams use AsyncAPI in production, grouped by use case. Mirrored from [`asyncapi/website/config/usecases.yaml`](https://github.com/asyncapi/website/blob/master/config/usecases.yaml) by the weekly refresh.

## Infrastructure as Code

This makes them a great fit for Infrastructure as Code. DevOps teams can use AsyncAPI contracts to automatically provision topics, assign access rights, and configure brokers. Instead of manual setup, everything is declarative and repeatable.

In production:

- **Raiffeisen Bank** — Implementing a Continuous Integration and Continuous Delivery (CI/CD) pipeline utilizing GitOps principles to deploy a topology constructed on AsyncAPI definitions using a Kubernetes operator to an Apache Pulsar cluster. ([Video](https://www.youtube.com/watch?v=_MwzLZMwFN8))
- **Kuehne+Nagel** — Implementing a GitOps-based pipeline to enable self-service management of Kafka infrastructure, including access control management. Automation of AsyncAPI document governance ensures consistency in the infrastructure at the pull request level. ([Slides](https://drive.google.com/file/d/1y67PI8NaITPPwZAiDF2Zs7ISfcIpqMV8/view?usp=sharing))
- **LEGO Group** — Managing brokers, where developers abstain from direct access to the management console and instead upload AsyncAPI documents to a self-service API, which provisions access and topics specified in the documents. ([Video](https://www.youtube.com/watch?v=m8I0fYjx6Cc))
- **Postman** — Enhancing discoverability of information about system events by building a tool called Synapse for provisioning entire event-based infrastructure, with AsyncAPI documents as the source of truth. ([Video](https://www.youtube.com/watch?v=0_7QZyKLPoE))
- **Bank of New Zealand** — Establishing a decentralized company-wide governance strategy for APIs, providing a self-service platform for publishing APIs and documentation. ([Video](https://www.confluent.io/events/kafka-summit-apac-2021/self-service-events-and-decentralised-governance-with-asyncapi-a-real-world/))
- **Morgan Stanley** — Used for sharing Websocket based APIs for discoverability and unified security. ([Slides](https://drive.google.com/file/d/1YzLwQZsMUXGwj_Lsqv-ZnvV2knuowWrS/view?usp=drive_link))

## Testing and Mocking

You don’t need to wait for producers to deploy before you start building consumers. Once teams agree on the event structure, you can capture it in an AsyncAPI contract and generate mocks directly. This lets developers test consumers against simulated producers, speeding up development and avoiding bottlenecks.

In production:

- **TransferGo** — TransferGo uses the AsyncAPI specification as the essential, standardized blueprint for their event-driven microservices, enabling automated documentation (Event Catalog), continuous validation, and reliable contract testing (Microcks) to ensure clarity and trust across their system. ([Article](https://www.asyncapi.com/blog/transfergo-asyncapi-story))
- **Lombard Odier** — Using AsyncAPI as contract for mocking and testing APIs and documentation. ([Slides](https://www.slideshare.net/slideshow/apidays-paris-2022-adding-a-mock-as-a-service-capability-to-your-api-strategy-portfolio-ludovic-pourrat-lombard-odier/255041645#4))

## Developer Portal and Discoverability

Generate documentation and share across entire organization which events exist, who produces them, who consumes them, and how traffic flows. This makes onboarding easier and promotes cross-team visibility. Identify what consumers will be affected by event changes introduced by producers.

In production:

- **LEGO Group** — Managing brokers, where developers abstain from direct access to the management console and instead upload AsyncAPI documents to a self-service API, which provisions access and topics specified in the documents. ([Video](https://www.youtube.com/watch?v=m8I0fYjx6Cc))
- **TransferGo** — TransferGo uses the AsyncAPI specification as the essential, standardized blueprint for their event-driven microservices, enabling automated documentation (Event Catalog), continuous validation, and reliable contract testing (Microcks) to ensure clarity and trust across their system. ([Article](https://www.asyncapi.com/blog/transfergo-asyncapi-story))
- **Bank of New Zealand** — Establishing a decentralized company-wide governance strategy for APIs, providing a self-service platform for publishing APIs and documentation. ([Video](https://www.confluent.io/events/kafka-summit-apac-2021/self-service-events-and-decentralised-governance-with-asyncapi-a-real-world/))
- **Zora Robotics** — Documenting public MQTT APIs for IoT products and constructing a developer portal. ([Video](https://www.youtube.com/watch?v=yjHgT0n2BtA))
- **Walmart** — Managing a centralized API Hub for internal teams, enhancing event discoverability and visibility using AsyncAPI. AsyncAPI facilitates company-wide governance on asynchronous APIs. ([Video](https://www.youtube.com/watch?v=SxTpGRaNIPo))
- **HDI Global SE** — The AsyncAPI documents are used for documentation purposes by the platform team. It provides a comprehensive overview of the asynchronous communication in our system, including the available topics and the structure of the messages. ([Use Case](https://www.asyncapi.com/casestudies/hdiglobal))
- **Adidas** — AsyncAPI is a standard for defining asynchronous APIs using Apache Kafka. AsyncAPI governed under official guidelines. AsyncAPI is promoted to be used for documentation and code generation. ([Docs](https://adidas.gitbook.io/api-guidelines/asynchronous-api-guidelines/kafka-asynchronous-guidelines/a_introduction/why-asyncapi))
- **SAP** — Using AsyncAPI to deliver company wide event catalog for easier discoverability of events and event-driven APIs. ([Video](https://www.youtube.com/watch?v=KcYiD67gEh0&list=PLbi1gRlP7pig_nA0tRlr0hU_h5sB2HXcq&index=6))
- **eBay** — Facilitating partner integration with eBay through asynchronous communication, leveraging public AsyncAPI documents for code generation and rapid integration, while ensuring governance and standardization. ([Video](https://www.youtube.com/watch?v=SxTpGRaNIPo))
- **Adeo** — Document the API of the product, so its users know how it works and how to use it. AsyncAPI was selected as the standard that allows you to generate documentation from a machine-readable document that describes the API. The goal was to document API in a standardized way, so other internal products could follow to unify how APIs are documented across the company. ([Use Case](https://www.asyncapi.com/casestudies/adeogroup))
- **Siemens AG** — Using AsyncAPI to document their ROS2 interfaces. ([Code](https://github.com/siemens/rosita))
- **PagoPA** — Using AsyncAPI for documentation purposes to help developers understand event-driven APIs. Using Springwolf project and generate AsyncAPI documents from code. ([Code](https://github.com/pagopa/p4pa-registries/blob/develop/asyncapi/generated.asyncapi.json))

## Governance and Consistency

Assure consistency across your event ecosystem. You can validate contracts to ensure topic names follow organizational standards, check that no sensitive information is exposed, and apply custom rules through linting. This builds governance into the development lifecycle without slowing teams down.

In production:

- **LEGO Group** — Defining, documenting, and distributing event-driven APIs while ensuring consistency and governance. ([Video](https://www.youtube.com/watch?v=qjarcJQVLOg))
- **Kuehne+Nagel** — Implementing a GitOps-based pipeline to enable self-service management of Kafka infrastructure, including access control management. Automation of AsyncAPI document governance ensures consistency in the infrastructure at the pull request level. ([Slides](https://drive.google.com/file/d/1y67PI8NaITPPwZAiDF2Zs7ISfcIpqMV8/view?usp=sharing))
- **Bank of New Zealand** — Establishing a decentralized company-wide governance strategy for APIs, providing a self-service platform for publishing APIs and documentation. ([Video](https://www.confluent.io/events/kafka-summit-apac-2021/self-service-events-and-decentralised-governance-with-asyncapi-a-real-world/))
- **Walmart** — Managing a centralized API Hub for internal teams, enhancing event discoverability and visibility using AsyncAPI. AsyncAPI facilitates company-wide governance on asynchronous APIs. ([Video](https://www.youtube.com/watch?v=SxTpGRaNIPo))
- **eBay** — Facilitating partner integration with eBay through asynchronous communication, leveraging public AsyncAPI documents for code generation and rapid integration, while ensuring governance and standardization. ([Video](https://www.youtube.com/watch?v=SxTpGRaNIPo))
- **Open University of Catalonia and Prodevelop** — Enabling monitoring of ports through a design-first approach, utilizing UML class diagrams to design the entire infrastructure. UML diagrams are source of truth for generated AsyncAPI documents that later are used for models and clients generation. These documents are extended with additional SLA properties to specify runtime quality of service requirements, facilitating real-time monitoring. ([Video](https://www.youtube.com/watch?v=m4KS6FSeTT4))

## Self-Service

Because AsyncAPI is machine-readable, it’s perfect for building self-service platforms. Teams can submit their contracts to a central service, which automatically validates schemas, publishes them to a shared registry, and provisions broker resources. This enables faster time-to-production while keeping standards and compliance intact.

In production:

- **LEGO Group** — Managing brokers, where developers abstain from direct access to the management console and instead upload AsyncAPI documents to a self-service API, which provisions access and topics specified in the documents. ([Video](https://www.youtube.com/watch?v=m8I0fYjx6Cc))
- **Walmart** — Managing a centralized API Hub for internal teams, enhancing event discoverability and visibility using AsyncAPI. AsyncAPI facilitates company-wide governance on asynchronous APIs. ([Video](https://www.youtube.com/watch?v=SxTpGRaNIPo))
- **Bank of New Zealand** — Establishing a decentralized company-wide governance strategy for APIs, providing a self-service platform for publishing APIs and documentation. ([Video](https://www.confluent.io/events/kafka-summit-apac-2021/self-service-events-and-decentralised-governance-with-asyncapi-a-real-world/))

## Code Generation

AsyncAPI helps eliminate boilerplate code. You can start by generating strongly typed models from message schemas and go further by producing client libraries or even SDKs. This accelerates development, reduces human error, and ensures producers and consumers always stay aligned with the contract.

In production:

- **Raiffeisen Bank** — Implementing a Continuous Integration and Continuous Delivery (CI/CD) pipeline utilizing GitOps principles to deploy a topology constructed on AsyncAPI definitions using a Kubernetes operator to an Apache Pulsar cluster. ([Video](https://www.youtube.com/watch?v=_MwzLZMwFN8))
- **Oracle** — Documenting data streaming APIs with AsyncAPI documents for client library generation in various programming languages, reducing development time for applications consuming data. ([Video](https://www.youtube.com/watch?v=CGLlxYy66LY))
- **Adobe** — Providing event documentation to expedite development by generating classes based on message payload information from AsyncAPI documents. ([Slides](https://drive.google.com/file/d/1AVCG9_fFtuOtrvZVZWENmU2aDT7C51Jr/view?usp=sharing))
- **Adidas** — AsyncAPI is a standard for defining asynchronous APIs using Apache Kafka. AsyncAPI governed under official guidelines. AsyncAPI is promoted to be used for documentation and code generation. ([Docs](https://adidas.gitbook.io/api-guidelines/asynchronous-api-guidelines/kafka-asynchronous-guidelines/a_introduction/why-asyncapi))
- **Open University of Catalonia and Prodevelop** — Enabling monitoring of ports through a design-first approach, utilizing UML class diagrams to design the entire infrastructure. UML diagrams are source of truth for generated AsyncAPI documents that later are used for models and clients generation. These documents are extended with additional SLA properties to specify runtime quality of service requirements, facilitating real-time monitoring. ([Video](https://www.youtube.com/watch?v=m4KS6FSeTT4))
- **TransferGo** — TransferGo uses the AsyncAPI specification as the essential, standardized blueprint for their event-driven microservices, enabling automated documentation (Event Catalog), continuous validation, and reliable contract testing (Microcks) to ensure clarity and trust across their system. ([Article](https://www.asyncapi.com/blog/transfergo-asyncapi-story))

## Extensibility - Quality of Service Monitoring

AsyncAPI supports extensions, so you can enrich contracts with operational requirements like SLA or QoS details. For example, an IoT device might declare its expected latency or throughput. Monitoring tools can read these extensions, track service quality, and raise alerts when metrics fall below agreed levels.

In production:

- **Open University of Catalonia and Prodevelop** — Enabling monitoring of ports through a design-first approach, utilizing UML class diagrams to design the entire infrastructure. UML diagrams are source of truth for generated AsyncAPI documents that later are used for models and clients generation. These documents are extended with additional SLA properties to specify runtime quality of service requirements, facilitating real-time monitoring. ([Video](https://www.youtube.com/watch?v=m4KS6FSeTT4))
