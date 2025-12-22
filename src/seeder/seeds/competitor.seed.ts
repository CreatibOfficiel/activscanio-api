import { Competitor } from 'src/competitors/competitor.entity';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

const logger = new Logger('CompetitorSeed');

export async function seedCompetitors(dataSource: DataSource) {
  const competitorRepository = dataSource.getRepository(Competitor);

  // Check if we already have any Competitors in the database
  const existingCount = await competitorRepository.count();
  if (existingCount > 0) {
    logger.log('🟡 Competitor already exist. Skipping...');
    return;
  }

  await competitorRepository.insert([
    {
      firstName: 'Anthony',
      lastName: 'Sel',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/66714297d1a2422e554f88cf_Anthony.webp',
    },
    {
      firstName: 'Aurèle',
      lastName: 'MP',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/668d115cd5514da29dbe157b_Aurel.webp',
    },
    {
      firstName: 'Benjamin',
      lastName: 'Couvreux',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671428d28cf7883360ec491_Benjamin.webp',
    },
    {
      firstName: 'Camille',
      lastName: 'Beck',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667142863f678524e8cbcf86_Camille.webp',
    },
    {
      firstName: 'Chloé',
      lastName: 'David',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671ac61e6b472f69b2ecc21_Chloe%CC%81.webp',
    },
    {
      firstName: 'Clément',
      lastName: 'Bouteille',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671426c9d426f27d883522c_Cle%CC%81ment.webp',
    },
    {
      firstName: 'Damien',
      lastName: 'Lorca',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/674eeb0247dda37eb91b6aee_Damien.webp',
    },
    {
      firstName: 'Daniel',
      lastName: 'Gittler',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6673f240680cbddf56029031_Ascan.webp',
    },
    {
      firstName: 'Élisa',
      lastName: 'BP',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671ac2e4989651eed305731_Elisa.webp',
    },
    {
      firstName: 'Emmeline',
      lastName: 'Hamez',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671424356cf4439df4be6d0_Emmeline.webp',
    },
    {
      firstName: 'Florian',
      lastName: 'Torres',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671423731492b572640f1dd_Florien.webp',
    },
    {
      firstName: 'Frédéric',
      lastName: 'Giraud',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/670cdc415947824a1a8961eb_Fred.webp',
    },
    {
      firstName: 'Gaultier',
      lastName: 'Hazoume',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/677d09a7214d992e2acc339f_Gaultier.png',
    },
    {
      firstName: 'Guillaume',
      lastName: 'Lafranceschina',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/675ac4356c208d3b58312306_Guillaume_1000.webp',
    },
    {
      firstName: 'Jean-Michel',
      lastName: 'Arouete',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/677d097e4d60590d84b314af_JM.png',
    },
    {
      firstName: 'Joran',
      lastName: 'Caunegre',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6720f37f08782dfa5ee7922f_Joran.webp',
    },
    {
      firstName: 'Julian',
      lastName: 'Miribel',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671421039fb13cfef231c30_Julian.webp',
    },
    {
      firstName: 'Karen',
      lastName: 'Garet',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671420456cf4439df4bafef_Karen.webp',
    },
    {
      firstName: 'Léo',
      lastName: 'Mibort',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/674eeb29fb1dbbfba60ba87d_Leo.webp',
    },
    {
      firstName: 'Lisa',
      lastName: 'Santoro',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667141ec4a2a3112d58cc3eb_Lisa.webp',
    },
    {
      firstName: 'Maëlle',
      lastName: 'Moussa',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/67bedf4533308e8cd8618c3b_Maelle.png',
    },
    {
      firstName: 'Mathilde',
      lastName: 'Vigouroux',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667141e0356d2c729f0319e7_Mathilde.webp',
    },
    {
      firstName: 'Maxime',
      lastName: 'Favier',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6720f3a78cfbf121fc89c17b_Max.webp',
    },
    {
      firstName: 'Maxime',
      lastName: 'Polèse',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/66714749d4696101c404f0be_Maxime%20P.webp',
    },
    {
      firstName: 'Nicolas',
      lastName: 'Miribel',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667142c4575ab53d5f47e689_Nicolas.webp',
    },
    {
      firstName: 'Nils',
      lastName: 'Pellen',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667147697b9b912909715277_Nils.webp',
    },
    {
      firstName: 'Téo',
      lastName: 'Maitrot',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6720f3627a3c7d2935fdc87d_Te%CC%81o.webp',
    },
    {
      firstName: 'Thibaud',
      lastName: 'CB',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667141351263454889022bd7_Thibauld.webp',
    },
    {
      firstName: 'Thomas',
      lastName: 'Wales',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/667140eb6802513246cff085_Thomas.webp',
    },
    {
      firstName: 'Valentin',
      lastName: 'Lopez',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/673f41a168b149d4cd7baf84_Valentin-L.webp',
    },
    {
      firstName: 'Jérem',
      lastName: 'Le Coach',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/66714083f387e411c05cf936_Je%CC%81rem.webp',
    },
    {
      firstName: 'Pinot',
      lastName: 'Cocker',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/66714ad02f4f40cc2c018bfd_Pinot.webp',
    },
    {
      firstName: 'Raya',
      lastName: 'Kangal',
      profilePictureUrl:
        'https://cdn.prod.website-files.com/664f5a68996a65b2123d7b3f/6671409e507d171dfeb89a2f_Raya.webp',
    },
  ]);

  logger.log('✅ Competitors seeded successfully!');
}
