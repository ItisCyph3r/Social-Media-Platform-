import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const httpApp = await NestFactory.create(AppModule);
  const httpPort = process.env.PORT || 3003;
  await httpApp.listen(httpPort);
  console.log(`[Post Service] HTTP server listening on port ${httpPort}`);

  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'post',
        protoPath: join(__dirname, '../../../shared/protos/post.proto'),
        url: process.env.GRPC_URL || '0.0.0.0:5003',
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    },
  );

  await grpcApp.listen();
  console.log(`[Post Service] gRPC server listening on port ${process.env.GRPC_URL || '5003'}`);
}

bootstrap();
