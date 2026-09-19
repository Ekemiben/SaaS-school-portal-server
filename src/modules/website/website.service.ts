import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreatePublicInquiryDto,
  UpdateInquiryStatusDto,
  UpdateWebsiteConfigDto,
  CreatePublicPageDto,
  UpdatePublicPageDto,
  CreatePublicNewsDto,
  UpdatePublicNewsDto,
  CreatePublicEventDto,
  UpdatePublicEventDto,
  CreatePublicAnnouncementDto,
  UpdatePublicAnnouncementDto,
  CreateGalleryMediaDto,
} from './dto/website.dto.js';

@Injectable()
export class WebsiteService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // 1. PUBLIC READ-ONLY WEBSITE SERVICES
  // ==========================================

  async getPublicConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        timezone: true,
        currency: true,
        websiteConfig: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('School tenant not found');
    }

    const config = tenant.websiteConfig;
    return {
      schoolName: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      faviconUrl: tenant.faviconUrl,
      primaryColor: tenant.primaryColor || '#0f172a',
      secondaryColor: tenant.secondaryColor || '#3b82f6',
      motto: config?.motto || '',
      tagline: config?.tagline || '',
      aboutStory: config?.aboutStory || '',
      aboutMission: config?.aboutMission || '',
      aboutVision: config?.aboutVision || '',
      aboutValues: config?.aboutValues || '',
      principalName: config?.principalName || '',
      principalTitle: config?.principalTitle || 'Principal',
      principalMessage: config?.principalMessage || '',
      principalPhotoUrl: config?.principalPhotoUrl || '',
      heroTitle: config?.heroTitle || `Welcome to ${tenant.name}`,
      heroSubtitle: config?.heroSubtitle || config?.motto || 'Nurturing excellence and integrity',
      heroCtaText: config?.heroCtaText || 'Apply Now',
      heroCtaLink: config?.heroCtaLink || '/admissions',
      heroImageUrl: config?.heroImageUrl || '',
      contactEmail: config?.contactEmail || '',
      contactPhone: config?.contactPhone || '',
      address: config?.address || '',
      mapCoordinates: config?.mapCoordinates || '',
      facebookUrl: config?.facebookUrl || '',
      twitterUrl: config?.twitterUrl || '',
      instagramUrl: config?.instagramUrl || '',
      linkedinUrl: config?.linkedinUrl || '',
      youtubeUrl: config?.youtubeUrl || '',
      seoTitle: config?.seoTitle || tenant.name,
      seoDescription: config?.seoDescription || `${tenant.name} - Official School Website`,
      seoKeywords: config?.seoKeywords || `${tenant.name}, school, education, portal`,
      isPublished: config?.isPublished ?? true,
    };
  }

  async getPublicPages(tenantId: string) {
    return this.prisma.publicPage.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        slug: true,
        title: true,
        template: true,
        metaTitle: true,
        metaDescription: true,
        publishedAt: true,
      },
      orderBy: { title: 'asc' },
    });
  }

  async getPublicPageBySlug(tenantId: string, slug: string) {
    const page = await this.prisma.publicPage.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug,
        },
      },
    });

    if (!page || page.status !== 'PUBLISHED') {
      throw new NotFoundException(`Page '${slug}' not found`);
    }

    return page;
  }

  async getPublicNews(tenantId: string, category?: string, limit = 20, page = 1) {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const where: any = {
      tenantId,
      status: 'PUBLISHED',
    };
    if (category) {
      where.category = category;
    }

    const [items, total] = await Promise.all([
      this.prisma.publicNews.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: safeLimit,
        skip,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          coverImageUrl: true,
          authorName: true,
          category: true,
          publishedAt: true,
        },
      }),
      this.prisma.publicNews.count({ where }),
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getPublicNewsBySlug(tenantId: string, slug: string) {
    const news = await this.prisma.publicNews.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug,
        },
      },
    });

    if (!news || news.status !== 'PUBLISHED') {
      throw new NotFoundException(`News article '${slug}' not found`);
    }

    return news;
  }

  async getPublicEvents(tenantId: string, upcomingOnly = false) {
    const where: any = {
      tenantId,
      status: 'PUBLISHED',
    };
    if (upcomingOnly) {
      where.startDate = { gte: new Date() };
    }

    return this.prisma.publicEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
  }

  async getPublicEventBySlug(tenantId: string, slug: string) {
    const event = await this.prisma.publicEvent.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug,
        },
      },
    });

    if (!event || event.status !== 'PUBLISHED') {
      throw new NotFoundException(`Event '${slug}' not found`);
    }

    return event;
  }

  async getPublicAnnouncements(tenantId: string) {
    const now = new Date();
    return this.prisma.publicAnnouncement.findMany({
      where: {
        tenantId,
        status: 'PUBLISHED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { publishedAt: 'desc' },
      ],
    });
  }

  async getPublicGallery(tenantId: string, albumName?: string) {
    const where: any = {
      tenantId,
      status: 'PUBLISHED',
    };
    if (albumName) {
      where.albumName = albumName;
    }

    return this.prisma.galleryMedia.findMany({
      where,
      orderBy: [
        { orderIndex: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async submitPublicInquiry(tenantId: string, dto: CreatePublicInquiryDto) {
    const tenantExists = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenantExists) {
      throw new NotFoundException('School tenant not found');
    }

    const inquiry = await this.prisma.publicAdmissionInquiry.create({
      data: {
        tenantId,
        studentName: dto.studentName.trim(),
        parentName: dto.parentName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        gradeApplying: dto.gradeApplying?.trim(),
        message: dto.message?.trim(),
        status: 'NEW',
      },
    });

    return {
      success: true,
      message: 'Your admission inquiry has been submitted successfully.',
      inquiryId: inquiry.id,
    };
  }

  // ==========================================
  // 2. ADMIN CMS WEBSITE SERVICES
  // ==========================================

  async getAdminConfig(tenantId: string) {
    let config = await this.prisma.websiteConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.websiteConfig.create({
        data: {
          tenantId,
          isPublished: true,
        },
      });
    }

    return config;
  }

  async updateAdminConfig(tenantId: string, dto: UpdateWebsiteConfigDto) {
    return this.prisma.websiteConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...dto,
      },
      update: {
        ...dto,
      },
    });
  }

  async getAdminPages(tenantId: string) {
    return this.prisma.publicPage.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createAdminPage(tenantId: string, dto: CreatePublicPageDto) {
    const existing = await this.prisma.publicPage.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`A page with slug '${dto.slug}' already exists`);
    }

    return this.prisma.publicPage.create({
      data: {
        tenantId,
        slug: dto.slug,
        title: dto.title,
        content: dto.content,
        template: dto.template || 'standard',
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        status: dto.status || 'DRAFT',
        publishedAt: dto.status === 'PUBLISHED' ? (dto.publishedAt ? new Date(dto.publishedAt) : new Date()) : null,
      },
    });
  }

  async updateAdminPage(tenantId: string, id: string, dto: UpdatePublicPageDto) {
    const page = await this.prisma.publicPage.findFirst({
      where: { id, tenantId },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const data: any = { ...dto };
    if (dto.publishedAt) {
      data.publishedAt = new Date(dto.publishedAt);
    } else if (dto.status === 'PUBLISHED' && !page.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.publicPage.update({
      where: { id },
      data,
    });
  }

  async deleteAdminPage(tenantId: string, id: string) {
    const page = await this.prisma.publicPage.findFirst({
      where: { id, tenantId },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.prisma.publicPage.delete({ where: { id } });
    return { success: true, message: 'Page deleted successfully' };
  }

  async getAdminNews(tenantId: string) {
    return this.prisma.publicNews.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdminNews(tenantId: string, dto: CreatePublicNewsDto) {
    const existing = await this.prisma.publicNews.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`A news story with slug '${dto.slug}' already exists`);
    }

    return this.prisma.publicNews.create({
      data: {
        tenantId,
        slug: dto.slug,
        title: dto.title,
        summary: dto.summary,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl,
        authorName: dto.authorName,
        category: dto.category || 'General',
        status: dto.status || 'DRAFT',
        publishedAt: dto.status === 'PUBLISHED' ? (dto.publishedAt ? new Date(dto.publishedAt) : new Date()) : null,
      },
    });
  }

  async updateAdminNews(tenantId: string, id: string, dto: UpdatePublicNewsDto) {
    const news = await this.prisma.publicNews.findFirst({
      where: { id, tenantId },
    });

    if (!news) {
      throw new NotFoundException('News article not found');
    }

    const data: any = { ...dto };
    if (dto.publishedAt) {
      data.publishedAt = new Date(dto.publishedAt);
    } else if (dto.status === 'PUBLISHED' && !news.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.publicNews.update({
      where: { id },
      data,
    });
  }

  async deleteAdminNews(tenantId: string, id: string) {
    const news = await this.prisma.publicNews.findFirst({
      where: { id, tenantId },
    });

    if (!news) {
      throw new NotFoundException('News article not found');
    }

    await this.prisma.publicNews.delete({ where: { id } });
    return { success: true, message: 'News article deleted successfully' };
  }

  async getAdminEvents(tenantId: string) {
    return this.prisma.publicEvent.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });
  }

  async createAdminEvent(tenantId: string, dto: CreatePublicEventDto) {
    const existing = await this.prisma.publicEvent.findUnique({
      where: {
        tenantId_slug: {
          tenantId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`An event with slug '${dto.slug}' already exists`);
    }

    return this.prisma.publicEvent.create({
      data: {
        tenantId,
        slug: dto.slug,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        allDay: dto.allDay || false,
        coverImageUrl: dto.coverImageUrl,
        status: dto.status || 'DRAFT',
        publishedAt: dto.status === 'PUBLISHED' ? (dto.publishedAt ? new Date(dto.publishedAt) : new Date()) : null,
      },
    });
  }

  async updateAdminEvent(tenantId: string, id: string, dto: UpdatePublicEventDto) {
    const event = await this.prisma.publicEvent.findFirst({
      where: { id, tenantId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (dto.publishedAt) {
      data.publishedAt = new Date(dto.publishedAt);
    } else if (dto.status === 'PUBLISHED' && !event.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.publicEvent.update({
      where: { id },
      data,
    });
  }

  async deleteAdminEvent(tenantId: string, id: string) {
    const event = await this.prisma.publicEvent.findFirst({
      where: { id, tenantId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.publicEvent.delete({ where: { id } });
    return { success: true, message: 'Event deleted successfully' };
  }

  async getAdminAnnouncements(tenantId: string) {
    return this.prisma.publicAnnouncement.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdminAnnouncement(tenantId: string, dto: CreatePublicAnnouncementDto) {
    return this.prisma.publicAnnouncement.create({
      data: {
        tenantId,
        title: dto.title,
        content: dto.content,
        priority: dto.priority || 'NORMAL',
        status: dto.status || 'DRAFT',
        publishedAt: dto.status === 'PUBLISHED' ? (dto.publishedAt ? new Date(dto.publishedAt) : new Date()) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async updateAdminAnnouncement(tenantId: string, id: string, dto: UpdatePublicAnnouncementDto) {
    const ann = await this.prisma.publicAnnouncement.findFirst({
      where: { id, tenantId },
    });

    if (!ann) {
      throw new NotFoundException('Announcement not found');
    }

    const data: any = { ...dto };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    if (dto.publishedAt) {
      data.publishedAt = new Date(dto.publishedAt);
    } else if (dto.status === 'PUBLISHED' && !ann.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.publicAnnouncement.update({
      where: { id },
      data,
    });
  }

  async deleteAdminAnnouncement(tenantId: string, id: string) {
    const ann = await this.prisma.publicAnnouncement.findFirst({
      where: { id, tenantId },
    });

    if (!ann) {
      throw new NotFoundException('Announcement not found');
    }

    await this.prisma.publicAnnouncement.delete({ where: { id } });
    return { success: true, message: 'Announcement deleted successfully' };
  }

  async getAdminGallery(tenantId: string) {
    return this.prisma.galleryMedia.findMany({
      where: { tenantId },
      orderBy: [
        { albumName: 'asc' },
        { orderIndex: 'asc' },
      ],
    });
  }

  async createAdminGallery(tenantId: string, dto: CreateGalleryMediaDto) {
    return this.prisma.galleryMedia.create({
      data: {
        tenantId,
        title: dto.title,
        caption: dto.caption,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType || 'IMAGE',
        albumName: dto.albumName || 'General',
        orderIndex: dto.orderIndex ?? 0,
        status: dto.status || 'PUBLISHED',
      },
    });
  }

  async deleteAdminGallery(tenantId: string, id: string) {
    const item = await this.prisma.galleryMedia.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      throw new NotFoundException('Gallery media item not found');
    }

    await this.prisma.galleryMedia.delete({ where: { id } });
    return { success: true, message: 'Gallery media deleted successfully' };
  }

  async getAdminInquiries(tenantId: string) {
    return this.prisma.publicAdmissionInquiry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAdminInquiryStatus(tenantId: string, id: string, dto: UpdateInquiryStatusDto) {
    const inquiry = await this.prisma.publicAdmissionInquiry.findFirst({
      where: { id, tenantId },
    });

    if (!inquiry) {
      throw new NotFoundException('Admission inquiry not found');
    }

    return this.prisma.publicAdmissionInquiry.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes !== undefined ? dto.notes : inquiry.notes,
      },
    });
  }
}
