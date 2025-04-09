import { Test, TestingModule } from '@nestjs/testing';
import { RaceAnalysisService } from './race-analysis.service';

describe('RaceAnalysisService', () => {
  let service: RaceAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RaceAnalysisService],
    }).compile();

    service = module.get<RaceAnalysisService>(RaceAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
