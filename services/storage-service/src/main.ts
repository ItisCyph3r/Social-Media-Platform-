import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'storage',
        protoPath: join(__dirname, '../../../shared/protos/storage.proto'),
        url: process.env.GRPC_URL || '0.0.0.0:5005',
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
  console.log(`[Storage Service] gRPC server listening on port ${process.env.GRPC_URL || '5005'}`);
}

bootstrap();
