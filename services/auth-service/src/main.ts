import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const grpcUrl = process.env.GRPC_URL;
  const protoPath = join(__dirname, '../../../shared/protos/auth.proto');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: protoPath,
      url: grpcUrl,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  await app.startAllMicroservices();
  
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`Auth Service is running on HTTP port ${port}`);
  console.log(`Auth Service gRPC is running on ${grpcUrl}`);
}
bootstrap();
