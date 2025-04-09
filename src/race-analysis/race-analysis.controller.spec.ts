import { Test, TestingModule } from '@nestjs/testing';
import { RaceAnalysisController } from './race-analysis.controller';

describe('RaceAnalysisController', () => {
  let controller: RaceAnalysisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaceAnalysisController],
    }).compile();

    controller = module.get<RaceAnalysisController>(RaceAnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
